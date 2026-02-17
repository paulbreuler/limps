import { spawn } from 'node:child_process';

export interface ObsidianMcpHttpProbeOptions {
  transport?: 'http';
  endpoint: string;
  timeoutMs: number;
}

export interface ObsidianMcpStdioProbeOptions {
  transport: 'stdio';
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs: number;
}

export type ObsidianMcpProbeOptions = ObsidianMcpHttpProbeOptions | ObsidianMcpStdioProbeOptions;

export interface ObsidianMcpProbeResult {
  ok: boolean;
  transport?: 'http-jsonrpc' | 'http-health' | 'stdio-jsonrpc';
  serverInfo?: {
    name?: string;
    version?: string;
  };
  toolsCount?: number;
  error?: string;
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

function normalizeEndpoint(endpoint: string): string {
  const value = endpoint.trim();
  if (!value) {
    throw new Error('Obsidian MCP endpoint is empty.');
  }
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function postJsonRpc<T>(
  endpoint: string,
  id: number,
  method: string,
  params: Record<string, unknown>,
  timeoutMs: number,
  sessionId?: string
): Promise<{
  ok: boolean;
  status: number;
  sessionId?: string;
  result?: T;
  error?: string;
}> {
  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
    };
    if (sessionId) {
      headers['mcp-session-id'] = sessionId;
    }

    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params,
        }),
      },
      timeoutMs
    );

    const nextSessionId = response.headers.get('mcp-session-id') ?? undefined;
    const body = (await response.text()).trim();

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        sessionId: nextSessionId,
        error: `HTTP ${response.status}`,
      };
    }

    if (!body) {
      return {
        ok: false,
        status: response.status,
        sessionId: nextSessionId,
        error: 'Empty JSON-RPC response',
      };
    }

    let parsed: JsonRpcResponse<T>;
    try {
      parsed = JSON.parse(body) as JsonRpcResponse<T>;
    } catch (error) {
      return {
        ok: false,
        status: response.status,
        sessionId: nextSessionId,
        error: `Invalid JSON-RPC payload: ${getErrorMessage(error)}`,
      };
    }

    if ('error' in parsed) {
      return {
        ok: false,
        status: response.status,
        sessionId: nextSessionId,
        error: parsed.error?.message ?? 'JSON-RPC error',
      };
    }

    return {
      ok: true,
      status: response.status,
      sessionId: nextSessionId,
      result: parsed.result,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: getErrorMessage(error),
    };
  }
}

async function checkHealthEndpoint(endpoint: string, timeoutMs: number): Promise<boolean> {
  try {
    const endpointUrl = new URL(endpoint);
    const healthUrl = new URL(endpointUrl.toString());
    healthUrl.pathname = `${healthUrl.pathname.replace(/\/$/, '')}/health`;
    const response = await fetchWithTimeout(
      healthUrl.toString(),
      {
        method: 'GET',
        headers: { accept: 'application/json,text/plain' },
      },
      timeoutMs
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function probeObsidianMcpHttp(options: ObsidianMcpHttpProbeOptions): Promise<ObsidianMcpProbeResult> {
  const endpoint = normalizeEndpoint(options.endpoint);
  const timeoutMs = Math.max(200, options.timeoutMs);

  const initialize = await postJsonRpc<{
    protocolVersion?: string;
    capabilities?: Record<string, unknown>;
    serverInfo?: { name?: string; version?: string };
  }>(
    endpoint,
    1,
    'initialize',
    {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'limps-obsidian-plugin',
        version: '0.0.1',
      },
    },
    timeoutMs
  );

  if (initialize.ok) {
    const tools = await postJsonRpc<{ tools?: unknown[] }>(
      endpoint,
      2,
      'tools/list',
      {},
      timeoutMs,
      initialize.sessionId
    );

    return {
      ok: true,
      transport: 'http-jsonrpc',
      serverInfo: initialize.result?.serverInfo,
      toolsCount: Array.isArray(tools.result?.tools) ? tools.result?.tools.length : 0,
    };
  }

  const healthOk = await checkHealthEndpoint(endpoint, timeoutMs);
  if (healthOk) {
    return {
      ok: true,
      transport: 'http-health',
    };
  }

  return {
    ok: false,
    error: `Unable to reach Obsidian MCP endpoint at ${endpoint}: ${initialize.error ?? 'unknown error'}`,
  };
}

async function probeObsidianMcpStdio(
  options: ObsidianMcpStdioProbeOptions
): Promise<ObsidianMcpProbeResult> {
  const command = options.command.trim();
  if (!command) {
    return {
      ok: false,
      error: 'Obsidian MCP stdio command is empty.',
    };
  }

  const timeoutMs = Math.max(200, options.timeoutMs);
  const args = options.args ?? [];
  const cwd = options.cwd?.trim() || process.cwd();

  return await new Promise<ObsidianMcpProbeResult>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let resolved = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let initialized = false;
    let serverInfo: { name?: string; version?: string } | undefined;

    const finish = (result: ObsidianMcpProbeResult): void => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      if (!child.killed) {
        child.kill('SIGTERM');
      }
      resolve(result);
    };

    const timeoutId = setTimeout(() => {
      const stderrSnippet = stderrBuffer.trim();
      finish({
        ok: false,
        error: stderrSnippet
          ? `Timed out waiting for Obsidian MCP stdio handshake: ${stderrSnippet}`
          : 'Timed out waiting for Obsidian MCP stdio handshake.',
      });
    }, timeoutMs);

    const sendJson = (message: Record<string, unknown>): void => {
      try {
        if (child.stdin.writable) {
          child.stdin.write(`${JSON.stringify(message)}\n`);
        }
      } catch (error) {
        finish({
          ok: false,
          error: `Failed to write to Obsidian MCP stdio process: ${getErrorMessage(error)}`,
        });
      }
    };

    const handleMessage = (message: unknown): void => {
      if (!message || typeof message !== 'object') return;
      const msg = message as Record<string, unknown>;
      const id = typeof msg.id === 'number' ? msg.id : null;

      if (msg.error && (id === 1 || id === 2)) {
        const errRecord = msg.error as { message?: string };
        finish({
          ok: false,
          error: errRecord?.message ?? 'Obsidian MCP stdio JSON-RPC error',
        });
        return;
      }

      if (!initialized && id === 1 && msg.result && typeof msg.result === 'object') {
        initialized = true;
        const result = msg.result as Record<string, unknown>;
        const info = result.serverInfo as Record<string, unknown> | undefined;
        serverInfo = {
          name: typeof info?.name === 'string' ? info.name : undefined,
          version: typeof info?.version === 'string' ? info.version : undefined,
        };

        sendJson({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {},
        });
        sendJson({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        });
        return;
      }

      if (initialized && id === 2 && msg.result && typeof msg.result === 'object') {
        const result = msg.result as Record<string, unknown>;
        const toolsValue = result.tools;
        finish({
          ok: true,
          transport: 'stdio-jsonrpc',
          serverInfo,
          toolsCount: Array.isArray(toolsValue) ? toolsValue.length : 0,
        });
      }
    };

    child.on('error', (error) => {
      finish({
        ok: false,
        error: `Failed to spawn Obsidian MCP stdio command: ${getErrorMessage(error)}`,
      });
    });

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const text = line.trim();
        if (!text) continue;

        try {
          const parsed = JSON.parse(text) as unknown;
          handleMessage(parsed);
        } catch {
          continue;
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderrBuffer += chunk.toString();
    });

    child.on('exit', (code, signal) => {
      if (resolved) return;
      const stderrSnippet = stderrBuffer.trim();
      finish({
        ok: false,
        error: stderrSnippet
          ? `Obsidian MCP stdio exited before handshake (code=${code ?? 'null'}, signal=${signal ?? 'null'}): ${stderrSnippet}`
          : `Obsidian MCP stdio exited before handshake (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`,
      });
    });

    sendJson({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'limps-obsidian-plugin',
          version: '0.0.1',
        },
      },
    });
  });
}

export async function probeObsidianMcp(options: ObsidianMcpProbeOptions): Promise<ObsidianMcpProbeResult> {
  if (options.transport === 'stdio') {
    return probeObsidianMcpStdio(options);
  }
  return probeObsidianMcpHttp(options);
}
