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
import { getHttpServerConfig } from './config.js';
import { getPidFilePath, writePidFile, removePidFile, getRunningDaemon } from './pidfile.js';
import { shutdownExtensions, type LoadedExtension } from './extensions/loader.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createRateLimiter, type RateLimiter } from './utils/rate-limiter.js';

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
}

const sessions = new Map<string, Session>();

let resources: ServerResources | null = null;
let httpServer: HttpServer | null = null;
let startTime: Date | null = null;
let rateLimiter: RateLimiter | null = null;

/**
 * Start the HTTP MCP server.
 *
 * @param configPathArg - Optional config path
 * @returns Promise that resolves when the server is listening
 */
export async function startHttpServer(configPathArg?: string): Promise<{
  port: number;
  host: string;
}> {
  // Initialize shared resources
  resources = await initServerResources(configPathArg);
  const httpConfig = getHttpServerConfig(resources.config);

  // Check for existing daemon
  const pidFilePath = getPidFilePath(resources.config.dataPath);
  const existing = getRunningDaemon(pidFilePath);
  if (existing) {
    throw new Error(
      `limps daemon already running (PID ${existing.pid} on ${existing.host}:${existing.port}). ` +
        `Run 'limps stop' first.`
    );
  }

  startTime = new Date();

  // Initialize rate limiter
  const rateLimitConfig = httpConfig.rateLimit ?? { maxRequests: 100, windowMs: 60000 };
  rateLimiter = createRateLimiter(rateLimitConfig.maxRequests, rateLimitConfig.windowMs);

  httpServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    // Check rate limit
    const clientIp = req.socket.remoteAddress ?? 'unknown';
    if (!rateLimiter!.isAllowed(clientIp)) {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': Math.ceil(rateLimitConfig.windowMs / 1000).toString()
      });
      res.end(JSON.stringify({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.'
      }));
      return;
    }

    // Check request body size before processing
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    const maxBodySize = httpConfig.maxBodySize ?? 10 * 1024 * 1024; // Default 10MB
    if (contentLength > maxBodySize) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Payload Too Large',
        maxSize: maxBodySize,
        receivedSize: contentLength
      }));
      return;
    }

    // CORS headers for browser-based MCP clients
    const corsOrigin = httpConfig.corsOrigin ?? '*';
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
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
        })
      );
      return;
    }

    // MCP endpoint
    if (url.pathname === '/mcp') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // Handle new session (POST without session ID, or initialize request)
      if (req.method === 'POST' && !sessionId) {
        await handleNewSession(req, res);
        return;
      }

      // Handle existing session
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId);
        if (session) {
          await session.transport.handleRequest(req, res);
        }
        return;
      }

      // Handle DELETE for session cleanup
      if (req.method === 'DELETE' && sessionId) {
        await cleanupSession(sessionId);
        res.writeHead(200);
        res.end();
        return;
      }

      // Unknown session
      if (sessionId) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
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
    server.on('error', reject);
    server.listen(httpConfig.port, httpConfig.host, () => {
      console.error(
        `limps HTTP server listening on http://${httpConfig.host}:${httpConfig.port}/mcp`
      );

      // Write PID file
      const started = startTime ?? new Date();
      writePidFile(pidFilePath, {
        pid: process.pid,
        port: httpConfig.port,
        host: httpConfig.host,
        startedAt: started.toISOString(),
      });

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
      sessions.set(sessionId, { transport, server, createdAt: new Date() });
      console.error(`MCP session created: ${maskSessionId(sessionId)}`);
    },
  });

  // Clean up on transport close
  transport.onclose = (): void => {
    const sid = transport.sessionId;
    if (sid) {
      sessions.delete(sid);
      console.error(`MCP session closed: ${maskSessionId(sid)}`);
    }
  };

  // Connect the MCP server to this transport
  await server.connect(transport);

  // Handle the initial request (which triggers the initialize handshake)
  await transport.handleRequest(req, res);
}

/**
 * Clean up a specific session.
 */
async function cleanupSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (session) {
    // Shutdown extensions for this session's server
    if (session.server.loadedExtensions) {
      await shutdownExtensions(session.server.loadedExtensions);
    }
    await session.transport.close();
    sessions.delete(sessionId);
    console.error(`MCP session cleaned up: ${maskSessionId(sessionId)}`);
  }
}

/**
 * Gracefully stop the HTTP server and all sessions.
 */
export async function stopHttpServer(): Promise<void> {
  // Close all active sessions
  for (const [sessionId, session] of sessions) {
    try {
      if (session.server.loadedExtensions) {
        await shutdownExtensions(session.server.loadedExtensions);
      }
      await session.transport.close();
    } catch (error) {
      console.error(`Error closing session ${maskSessionId(sessionId)}:`, error);
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
    const pidFilePath = getPidFilePath(resources.config.dataPath);
    removePidFile(pidFilePath);

    // Shut down shared resources
    await shutdownServerResources(resources);
    resources = null;
  }

  startTime = null;
}
