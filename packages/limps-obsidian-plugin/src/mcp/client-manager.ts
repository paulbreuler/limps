import { execCommand, type CommandExecResult } from '../cli/wrapper.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpClientManagerOptions {
  endpoint: string;
  maxReconnectAttempts?: number;
  toolCallTimeoutMs?: number;
  keepaliveIntervalMs?: number;
}

export interface CallToolResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

export type McpEventType = 'connected' | 'disconnected' | 'reconnecting' | 'error';

export type McpEventPayload = {
  connected: { sessionId: string };
  disconnected: { reason: string };
  reconnecting: { attempt: number; maxAttempts: number };
  error: { error: Error };
};

type McpEventListener<T extends McpEventType> = (payload: McpEventPayload[T]) => void;

export interface CliOptions {
  limpsPath: string;
  configPath?: string;
  cwd: string;
  timeoutMs: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeEndpoint(endpoint: string): string {
  const value = endpoint.trim();
  if (!value) {
    throw new Error('MCP endpoint is empty.');
  }
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

interface JsonRpcSuccess<T> {
  jsonrpc: '2.0';
  id: number;
  result: T;
}

interface JsonRpcError {
  jsonrpc: '2.0';
  id: number | null;
  error: { code: number; message: string };
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError;

const SESSION_EXPIRED_CODE = -32001;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_TOOL_CALL_TIMEOUT_MS = 30_000;
const DEFAULT_KEEPALIVE_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 16_000;

// ---------------------------------------------------------------------------
// McpClientManager
// ---------------------------------------------------------------------------

export class McpClientManager {
  private endpoint: string;
  private sessionId: string | undefined;
  private connected = false;
  private reconnecting = false;
  private requestId = 0;
  private lastToolCallTime = 0;
  private keepaliveTimer: ReturnType<typeof setInterval> | undefined;
  private disposed = false;

  private readonly maxReconnectAttempts: number;
  private readonly toolCallTimeoutMs: number;
  private readonly keepaliveIntervalMs: number;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly listeners = new Map<McpEventType, Set<McpEventListener<any>>>();

  constructor(options: McpClientManagerOptions) {
    this.endpoint = normalizeEndpoint(options.endpoint);
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    this.toolCallTimeoutMs = options.toolCallTimeoutMs ?? DEFAULT_TOOL_CALL_TIMEOUT_MS;
    this.keepaliveIntervalMs = options.keepaliveIntervalMs ?? DEFAULT_KEEPALIVE_INTERVAL_MS;
  }

  // ---- Event emitter ----

  on<T extends McpEventType>(event: T, listener: McpEventListener<T>): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
  }

  off<T extends McpEventType>(event: T, listener: McpEventListener<T>): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit<T extends McpEventType>(event: T, payload: McpEventPayload[T]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch {
        // swallow listener errors
      }
    }
  }

  // ---- Low-level JSON-RPC ----

  private nextId(): number {
    return ++this.requestId;
  }

  private async postJsonRpc<T>(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number
  ): Promise<{
    ok: boolean;
    sessionId?: string;
    result?: T;
    errorCode?: number;
    error?: string;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json',
      };
      if (this.sessionId) {
        headers['mcp-session-id'] = this.sessionId;
      }

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: this.nextId(),
          method,
          params,
        }),
        signal: controller.signal,
      });

      const nextSessionId = response.headers.get('mcp-session-id') ?? undefined;
      const body = (await response.text()).trim();

      if (!response.ok) {
        return { ok: false, sessionId: nextSessionId, error: `HTTP ${response.status}` };
      }

      if (!body) {
        return { ok: false, sessionId: nextSessionId, error: 'Empty JSON-RPC response' };
      }

      let parsed: JsonRpcResponse<T>;
      try {
        parsed = JSON.parse(body) as JsonRpcResponse<T>;
      } catch (parseError) {
        return {
          ok: false,
          sessionId: nextSessionId,
          error: `Invalid JSON-RPC payload: ${getErrorMessage(parseError)}`,
        };
      }

      if ('error' in parsed) {
        return {
          ok: false,
          sessionId: nextSessionId,
          errorCode: parsed.error?.code,
          error: parsed.error?.message ?? 'JSON-RPC error',
        };
      }

      return { ok: true, sessionId: nextSessionId, result: parsed.result };
    } catch (error) {
      return { ok: false, error: getErrorMessage(error) };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ---- Connection lifecycle ----

  async connect(endpoint?: string): Promise<void> {
    if (endpoint) {
      this.endpoint = normalizeEndpoint(endpoint);
    }

    this.disposed = false;

    const init = await this.postJsonRpc<{
      protocolVersion?: string;
      capabilities?: Record<string, unknown>;
      serverInfo?: { name?: string; version?: string };
    }>(
      'initialize',
      {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'limps-obsidian-plugin', version: '0.0.1' },
      },
      this.toolCallTimeoutMs
    );

    if (!init.ok) {
      throw new Error(`MCP initialize failed: ${init.error}`);
    }

    this.sessionId = init.sessionId;
    this.connected = true;

    // Send initialized notification (fire-and-forget)
    this.postJsonRpc('notifications/initialized', {}, 5000).catch(() => {
      // best effort
    });

    this.startKeepalive();
    this.emit('connected', { sessionId: this.sessionId ?? '' });
  }

  async disconnect(): Promise<void> {
    this.disposed = true;
    this.stopKeepalive();

    if (this.connected && this.sessionId) {
      // Best-effort DELETE to end session
      try {
        const headers: Record<string, string> = {
          'mcp-session-id': this.sessionId,
        };
        await fetch(this.endpoint, { method: 'DELETE', headers }).catch(() => {});
      } catch {
        // swallow
      }
    }

    const wasConnected = this.connected;
    this.connected = false;
    this.sessionId = undefined;
    this.reconnecting = false;

    if (wasConnected) {
      this.emit('disconnected', { reason: 'disconnect() called' });
    }
  }

  isConnected(): boolean {
    return this.connected && !this.disposed;
  }

  // ---- Tool calling ----

  async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    if (!this.connected || !this.sessionId) {
      throw new Error('Not connected to MCP server');
    }

    const result = await this.postJsonRpc<CallToolResult>(
      'tools/call',
      { name, arguments: args },
      this.toolCallTimeoutMs
    );

    this.lastToolCallTime = Date.now();

    if (!result.ok) {
      if (result.errorCode === SESSION_EXPIRED_CODE || result.error?.includes('SESSION_EXPIRED')) {
        await this.handleSessionExpired();
        // Retry once after reconnect
        const retry = await this.postJsonRpc<CallToolResult>(
          'tools/call',
          { name, arguments: args },
          this.toolCallTimeoutMs
        );
        if (!retry.ok) {
          throw new Error(`Tool call '${name}' failed after reconnect: ${retry.error}`);
        }
        this.lastToolCallTime = Date.now();
        return retry.result ?? { content: [] };
      }

      throw new Error(`Tool call '${name}' failed: ${result.error}`);
    }

    return result.result ?? { content: [] };
  }

  // ---- CLI fallback ----

  async callToolViaCli(
    name: string,
    args: Record<string, unknown>,
    cliOptions: CliOptions
  ): Promise<unknown> {
    const cliArgs = [name];
    for (const [key, value] of Object.entries(args)) {
      cliArgs.push(`--${key}`, String(value));
    }

    const result: CommandExecResult = await execCommand({
      command: cliOptions.limpsPath,
      args: ['tool', 'call', ...cliArgs, '--json'],
      cwd: cliOptions.cwd,
      timeoutMs: cliOptions.timeoutMs,
      parseJson: true,
    });

    if (!result.ok) {
      throw new Error(`CLI fallback for '${name}' failed: ${result.error ?? 'unknown error'}`);
    }

    return result.data;
  }

  // ---- Reconnection ----

  private async handleSessionExpired(): Promise<void> {
    this.connected = false;
    this.sessionId = undefined;
    this.stopKeepalive();

    await this.reconnect();
  }

  private async reconnect(): Promise<void> {
    if (this.reconnecting || this.disposed) return;
    this.reconnecting = true;

    let attempt = 0;
    while (attempt < this.maxReconnectAttempts && !this.disposed) {
      attempt++;
      this.emit('reconnecting', { attempt, maxAttempts: this.maxReconnectAttempts });

      const backoffMs = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt - 1), BACKOFF_MAX_MS);
      await this.sleep(backoffMs);

      if (this.disposed) break;

      try {
        await this.connect();
        this.reconnecting = false;
        return;
      } catch {
        // continue to next attempt
      }
    }

    this.reconnecting = false;
    this.connected = false;
    this.emit('disconnected', { reason: 'max reconnect attempts exhausted' });
    this.emit('error', { error: new Error('All reconnect attempts exhausted') });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ---- Keepalive ----

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      void this.sendKeepalive();
    }, this.keepaliveIntervalMs);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer !== undefined) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = undefined;
    }
  }

  private async sendKeepalive(): Promise<void> {
    if (!this.connected || this.disposed) return;

    // Skip if a tool call happened recently
    const sinceLastCall = Date.now() - this.lastToolCallTime;
    if (sinceLastCall < this.keepaliveIntervalMs * 0.8) {
      return;
    }

    try {
      const result = await this.postJsonRpc('ping', {}, 10_000);
      if (!result.ok) {
        if (
          result.errorCode === SESSION_EXPIRED_CODE ||
          result.error?.includes('SESSION_EXPIRED')
        ) {
          await this.handleSessionExpired();
        }
      }
    } catch (error) {
      this.emit('error', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }
}
