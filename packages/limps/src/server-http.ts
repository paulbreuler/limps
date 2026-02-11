/**
 * HTTP server for MCP transport using StreamableHTTPServerTransport.
 * Provides a persistent HTTP daemon that multiple MCP clients can connect to.
 */

import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { createServer as createHttpServer, type Server as HttpServer } from 'http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer as createMcpServer } from './server.js';
import {
  initServerResources,
  shutdownServerResources,
  type ServerResources,
} from './server-shared.js';
import { getHttpServerConfig, type HttpServerConfig, loadConfig } from './config.js';
import { getPidFilePath, writePidFile, removePidFile, getRunningDaemon } from './pidfile.js';
import { resolveConfigPath } from './utils/config-resolver.js';
import { shutdownExtensions, type LoadedExtension } from './extensions/loader.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createRateLimiter, type RateLimiter } from './utils/rate-limiter.js';
import { findProcessUsingPort } from './utils/port-checker.js';
import { getPackageVersion, getPackageName } from './utils/version.js';
import { logRedactedError } from './utils/safe-logging.js';

/**
 * Mask a session ID for logging to avoid exposing full UUIDs.
 * Shows only first 8 characters followed by '...'.
 */
function maskSessionId(sessionId: string): string {
  if (sessionId.length <= 8) return sessionId;
  return `${sessionId.slice(0, 8)}...`;
}

/**
 * Active session tracking.
 */
interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer & { loadedExtensions?: LoadedExtension[] };
  createdAt: Date;
  lastActiveAt: Date;
}

const sessions = new Map<string, Session>();

/**
 * Expired session tracking with reason for reconnection support.
 * Sessions are tracked for 24 hours after expiration to help clients
 * distinguish between "expired" vs "never existed" sessions.
 */
interface ExpiredSessionInfo {
  expiredAt: Date;
  reason: 'timeout' | 'closed' | 'deleted';
}

const expiredSessions = new Map<string, ExpiredSessionInfo>();
const EXPIRED_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

let resources: ServerResources | null = null;
let httpServer: HttpServer | null = null;
let startTime: Date | null = null;
let rateLimiter: RateLimiter | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;
let activePidFilePath: string | null = null;

export interface StartHttpServerOptions {
  port?: number;
  host?: string;
  /**
   * Optional path where daemon stdout/stderr is persisted.
   * Only set in detached daemon mode.
   */
  daemonLogPath?: string;
}

/**
 * Start the HTTP MCP server.
 *
 * @param configPathArg - Optional config path
 * @param options - Optional runtime host/port/log-path overrides
 * @returns Promise that resolves when the server is listening
 */
export async function startHttpServer(
  configPathArg?: string,
  options?: StartHttpServerOptions
): Promise<{
  port: number;
  host: string;
}> {
  // Load config first to check for existing daemon before initializing resources
  const configPath = resolveConfigPath(configPathArg);
  const preConfig = loadConfig(configPath);
  const preResolvedHttpConfig = getHttpServerConfig(preConfig);
  const effectiveHost = options?.host ?? preResolvedHttpConfig.host;
  const effectivePort = options?.port ?? preResolvedHttpConfig.port;
  const preHttpConfig: HttpServerConfig = {
    ...preResolvedHttpConfig,
    host: effectiveHost,
    port: effectivePort,
  };

  // Check for existing daemon BEFORE initializing resources to avoid leaks
  // Use system-level PID file based on port number
  const pidFilePath = getPidFilePath(preHttpConfig.port);
  const existing = getRunningDaemon(pidFilePath);
  if (existing) {
    throw new Error(
      `limps daemon already running (PID ${existing.pid} on ${existing.host}:${existing.port}). ` +
        `Run 'limps server stop' first.`
    );
  }

  // Initialize shared resources only after confirming no daemon exists
  resources = await initServerResources(configPath);
  const resolvedHttpConfig: HttpServerConfig = getHttpServerConfig(resources.config);
  const httpConfig: HttpServerConfig = {
    ...resolvedHttpConfig,
    host: options?.host ?? resolvedHttpConfig.host,
    port: options?.port ?? resolvedHttpConfig.port,
  };
  const maxSessions = httpConfig.maxSessions ?? 100;

  startTime = new Date();

  // Initialize rate limiter
  const rateLimitConfig = httpConfig.rateLimit ?? { maxRequests: 100, windowMs: 60000 };
  rateLimiter = createRateLimiter(rateLimitConfig.maxRequests, rateLimitConfig.windowMs);

  // Start session idle timeout cleanup (disabled if sessionTimeoutMs is 0)
  const sessionTimeoutMs = httpConfig.sessionTimeoutMs ?? 30 * 60 * 1000;
  const cleaningUp = new Set<string>();
  cleanupInterval = setInterval(() => {
    const now = Date.now();

    // Clean up old expired session records
    for (const [sessionId, info] of expiredSessions) {
      if (now - info.expiredAt.getTime() > EXPIRED_SESSION_RETENTION_MS) {
        expiredSessions.delete(sessionId);
      }
    }

    // Check for idle sessions to timeout (skip if timeout is disabled)
    if (sessionTimeoutMs > 0) {
      for (const [sessionId, session] of sessions) {
        if (cleaningUp.has(sessionId)) continue;
        if (now - session.lastActiveAt.getTime() > sessionTimeoutMs) {
          console.error(`Session ${maskSessionId(sessionId)} timed out after idle`);
          cleaningUp.add(sessionId);
          cleanupSession(sessionId, 'timeout')
            .catch((err) => {
              logRedactedError(
                `Error cleaning up timed-out session ${maskSessionId(sessionId)}`,
                err
              );
            })
            .finally(() => {
              cleaningUp.delete(sessionId);
            });
        }
      }
    }
  }, 60_000);

  httpServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    // Check rate limit
    const clientIp = req.socket.remoteAddress ?? 'unknown';
    if (rateLimiter && !rateLimiter.isAllowed(clientIp)) {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': Math.ceil(rateLimitConfig.windowMs / 1000).toString(),
      });
      res.end(
        JSON.stringify({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
        })
      );
      return;
    }

    // Check request body size before processing
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    const maxBodySize = httpConfig.maxBodySize ?? 10 * 1024 * 1024; // Default 10MB
    if (contentLength > maxBodySize) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Payload Too Large',
          maxSize: maxBodySize,
          receivedSize: contentLength,
        })
      );
      return;
    }

    // CORS headers for browser-based MCP clients (skip when corsOrigin is empty)
    const corsOrigin = httpConfig.corsOrigin ?? '';
    if (corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(corsOrigin ? 204 : 405);
      res.end();
      return;
    }

    // Health endpoint
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          sessions: sessions.size,
          uptime: startTime ? Math.floor((Date.now() - startTime.getTime()) / 1000) : 0,
          pid: process.pid,
          sessionTimeoutMs,
          version: getPackageVersion(),
          name: getPackageName(),
        })
      );
      return;
    }

    // Version endpoint
    if (url.pathname === '/version') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          name: getPackageName(),
          version: getPackageVersion(),
          nodeVersion: process.version,
        })
      );
      return;
    }

    // MCP endpoint
    if (url.pathname === '/mcp') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // Handle DELETE for session cleanup (must be checked before session lookup)
      if (req.method === 'DELETE' && sessionId) {
        if (sessions.has(sessionId)) {
          await cleanupSession(sessionId, 'deleted');
          res.writeHead(200);
          res.end();
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session not found' }));
        }
        return;
      }

      // Handle new session (POST without session ID, or initialize request)
      if (req.method === 'POST' && !sessionId) {
        if (sessions.size >= maxSessions) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Too Many Sessions',
              message: `Maximum concurrent sessions (${maxSessions}) reached. Try again later.`,
            })
          );
          return;
        }
        await handleNewSession(req, res);
        return;
      }

      // Handle existing session
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId);
        if (session) {
          session.lastActiveAt = new Date();
          await session.transport.handleRequest(req, res);
        }
        return;
      }

      // Unknown or expired session - check if it was previously known
      if (sessionId) {
        const expiredInfo = expiredSessions.get(sessionId);
        if (expiredInfo) {
          // Session expired - client should reconnect
          res.writeHead(404, {
            'Content-Type': 'application/json',
            'X-Session-Expired': 'true',
            'X-Session-Expired-Reason': expiredInfo.reason,
          });
          res.end(
            JSON.stringify({
              error: 'Session expired',
              code: 'SESSION_EXPIRED',
              message: `Session expired due to ${expiredInfo.reason}. Please reconnect without session ID.`,
              expiredAt: expiredInfo.expiredAt.toISOString(),
            })
          );
        } else {
          // Session never existed
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Session not found',
              code: 'SESSION_NOT_FOUND',
              message:
                'Session ID not recognized. It may have been invalid or the server was restarted.',
            })
          );
        }
        return;
      }

      // GET without session (SSE initial connect) — need a session first
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing mcp-session-id header' }));
      return;
    }

    // 404 for everything else
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  const server = httpServer;
  return new Promise<{ port: number; host: string }>((resolve, reject) => {
    server.on('error', (err: NodeJS.ErrnoException) => {
      // Enhanced error handling for port conflicts
      if (err.code === 'EADDRINUSE') {
        const processInfo = findProcessUsingPort(httpConfig.port);
        if (processInfo) {
          const errorMsg = [
            `Port ${httpConfig.port} is already in use.`,
            `Process using port: ${processInfo.name} (PID ${processInfo.pid})`,
            `Command: ${processInfo.command}`,
            ``,
            `To stop the process: kill ${processInfo.pid}`,
            `Or use a different port: limps server start --port <port>`,
          ].join('\n');
          reject(new Error(errorMsg));
        } else {
          reject(
            new Error(
              `Port ${httpConfig.port} is already in use. Use a different port: limps server start --port <port>`
            )
          );
        }
      } else {
        reject(err);
      }
    });

    server.listen(httpConfig.port, httpConfig.host, () => {
      console.error(
        `limps HTTP server listening on http://${httpConfig.host}:${httpConfig.port}/mcp`
      );

      // Write PID file
      const started = startTime ?? new Date();
      const pidContents = {
        pid: process.pid,
        port: httpConfig.port,
        host: httpConfig.host,
        startedAt: started.toISOString(),
        configPath,
      };
      if (options?.daemonLogPath) {
        writePidFile(pidFilePath, { ...pidContents, logPath: options.daemonLogPath });
      } else {
        writePidFile(pidFilePath, pidContents);
      }
      activePidFilePath = pidFilePath;

      resolve({ port: httpConfig.port, host: httpConfig.host });
    });
  });
}

/**
 * Handle a new MCP session: create transport, connect server, handle request.
 */
async function handleNewSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!resources) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server not initialized' }));
    return;
  }

  // Create a fresh MCP server for this session
  const server = await createMcpServer(resources.config, resources.db);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: (): string => randomUUID(),
    onsessioninitialized: (sessionId: string): void => {
      // Store the session once the MCP handshake completes
      const now = new Date();
      sessions.set(sessionId, { transport, server, createdAt: now, lastActiveAt: now });
      console.error(`MCP session created: ${maskSessionId(sessionId)}`);
    },
  });

  // Clean up on transport close
  transport.onclose = (): void => {
    const sid = transport.sessionId;
    if (sid) {
      cleanupSession(sid, 'closed').catch((err) => {
        logRedactedError(`Error during session close cleanup for ${maskSessionId(sid)}`, err);
      });
    }
  };

  // Connect the MCP server to this transport
  await server.connect(transport);

  // Handle the initial request (which triggers the initialize handshake)
  await transport.handleRequest(req, res);
}

/**
 * Clean up a specific session.
 * @param sessionId - The session ID to clean up
 * @param reason - The reason for cleanup (timeout, closed, deleted)
 */
async function cleanupSession(
  sessionId: string,
  reason: 'timeout' | 'closed' | 'deleted'
): Promise<void> {
  const session = sessions.get(sessionId);
  if (session) {
    // Prevent double cleanup (e.g., if transport.onclose fires during manual cleanup)
    // by removing from sessions map first, then checking if already tracked
    sessions.delete(sessionId);

    // Only track if not already in expiredSessions (preserve original reason like 'deleted')
    if (!expiredSessions.has(sessionId)) {
      expiredSessions.set(sessionId, {
        expiredAt: new Date(),
        reason,
      });
    }

    // Shutdown extensions for this session's server
    if (session.server.loadedExtensions) {
      await shutdownExtensions(session.server.loadedExtensions);
    }
    await session.transport.close();

    console.error(`MCP session cleaned up: ${maskSessionId(sessionId)} (reason: ${reason})`);
  }
}

/**
 * Gracefully stop the HTTP server and all sessions.
 */
export async function stopHttpServer(): Promise<void> {
  // Stop session cleanup interval
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  // Close all active sessions
  for (const [sessionId, session] of sessions) {
    try {
      if (session.server.loadedExtensions) {
        await shutdownExtensions(session.server.loadedExtensions);
      }
      await session.transport.close();
      // Track as closed for reconnection support
      expiredSessions.set(sessionId, {
        expiredAt: new Date(),
        reason: 'closed',
      });
    } catch (error) {
      logRedactedError(`Error closing session ${maskSessionId(sessionId)}`, error);
    }
  }
  sessions.clear();

  // Close HTTP server
  if (httpServer) {
    const server = httpServer;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    httpServer = null;
    console.error('HTTP server stopped');
  }

  // Clean up PID file
  if (resources) {
    const pidFilePath =
      activePidFilePath ?? getPidFilePath(getHttpServerConfig(resources.config).port);
    removePidFile(pidFilePath);

    // Shut down shared resources
    await shutdownServerResources(resources);
    resources = null;
  }

  startTime = null;
  activePidFilePath = null;
}
