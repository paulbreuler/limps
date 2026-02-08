/**
 * End-to-end tests for the HTTP MCP server.
 * Spawns real HTTP servers on random ports and tests all endpoints,
 * session lifecycle, rate limiting, body size enforcement, CORS, and maxSessions.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { spawn, type ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import { request as httpRequest, type IncomingMessage } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENTRY_PATH = join(__dirname, '..', 'dist', 'server-http-entry.js');

/** MCP-required Accept header for POST requests. */
const MCP_ACCEPT = 'application/json, text/event-stream';

/**
 * Parse an SSE response body to extract JSON data.
 * SSE format: "event: message\ndata: {json}\n\n"
 */
function parseSSEBody(body: string): unknown {
  const lines = body.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      return JSON.parse(line.slice(6));
    }
  }
  // Try parsing as plain JSON (non-SSE response)
  return JSON.parse(body);
}

/** Standard MCP initialize message. */
const MCP_INIT_MESSAGE = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'e2e-test', version: '0.0.1' },
  },
});

/** Helper to make an HTTP request and return status + body. */
function makeRequest(options: {
  host: string;
  port: number;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  /** Override Content-Length header value (for testing body size enforcement). */
  contentLengthOverride?: string;
}): Promise<{ status: number; headers: IncomingMessage['headers']; body: string }> {
  return new Promise((resolve, reject) => {
    const contentLengthHeaders: Record<string, string> = {};
    if (options.contentLengthOverride !== undefined) {
      contentLengthHeaders['Content-Length'] = options.contentLengthOverride;
    } else if (options.body) {
      contentLengthHeaders['Content-Length'] = Buffer.byteLength(options.body).toString();
    }

    const req = httpRequest(
      {
        hostname: options.host,
        port: options.port,
        method: options.method,
        path: options.path,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers ?? {}),
          ...contentLengthHeaders,
        },
        timeout: options.timeout ?? 5000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/** Create a config file for e2e tests and return the path. */
function createTestConfig(testDir: string, overrides: Record<string, unknown> = {}): string {
  const plansDir = join(testDir, 'plans');
  const planDir = join(plansDir, '0001-test');
  mkdirSync(planDir, { recursive: true });

  writeFileSync(
    join(planDir, '0001-test-plan.md'),
    `---\nname: Test\nworkType: feature\nstatus: GAP\n---\n\n# Test Plan\n`,
    'utf-8'
  );

  const configPath = join(testDir, 'config.json');
  writeFileSync(
    configPath,
    JSON.stringify({
      plansPath: plansDir,
      dataPath: join(testDir, 'data'),
      scoring: { weights: { dependency: 40, priority: 30, workload: 30 }, biases: {} },
      ...overrides,
    }),
    'utf-8'
  );
  return configPath;
}

/** Pick a random port in the ephemeral range. */
function randomPort(): number {
  return 30000 + Math.floor(Math.random() * 20000);
}

/** Spawn a server daemon and wait for it to become healthy. */
async function spawnDaemon(configPath: string, host: string, port: number): Promise<ChildProcess> {
  const child = spawn(process.execPath, [ENTRY_PATH, configPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  child.stderr?.on('data', () => {});

  // Wait for health
  const start = Date.now();
  const maxWait = 15000;
  while (Date.now() - start < maxWait) {
    try {
      const res = await makeRequest({ host, port, method: 'GET', path: '/health', timeout: 1000 });
      if (res.status === 200) return child;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill('SIGKILL');
  throw new Error(`Server did not become healthy within ${maxWait}ms`);
}

/** Kill a child process and wait for it to exit. */
async function killDaemon(child: ChildProcess | null): Promise<void> {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child?.kill('SIGKILL');
      resolve();
    }, 5000);
    child?.on('close', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

// =============================================================================
// Main E2E suite: health, CORS, 404, MCP routing, sessions, body size
// =============================================================================

describe('HTTP Server E2E', () => {
  let testDir: string;
  let child: ChildProcess | null = null;
  const port = randomPort();
  const host = '127.0.0.1';

  beforeAll(async () => {
    testDir = join(tmpdir(), `limps-http-e2e-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const configPath = createTestConfig(testDir, {
      server: {
        port,
        host,
        maxSessions: 10,
        corsOrigin: '*', // Explicit — default is '' (no CORS headers)
        // High rate limit so it doesn't interfere with tests in this suite
        rateLimit: { maxRequests: 1000, windowMs: 60000 },
      },
    });
    child = await spawnDaemon(configPath, host, port);
  }, 20_000);

  afterAll(async () => {
    await killDaemon(child);
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('/health endpoint', () => {
    it('should return 200 with status ok', async () => {
      const res = await makeRequest({ host, port, method: 'GET', path: '/health' });
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body) as {
        status: string;
        sessions: number;
        uptime: number;
        pid: number;
      };
      expect(body.status).toBe('ok');
      expect(body.sessions).toBeTypeOf('number');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.pid).toBeTypeOf('number');
    });

    it('should include CORS headers', async () => {
      const res = await makeRequest({ host, port, method: 'GET', path: '/health' });
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });
  });

  describe('CORS preflight', () => {
    it('should return 204 for OPTIONS request', async () => {
      const res = await makeRequest({ host, port, method: 'OPTIONS', path: '/mcp' });
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(res.headers['access-control-allow-headers']).toContain('mcp-session-id');
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown paths', async () => {
      const res = await makeRequest({ host, port, method: 'GET', path: '/unknown' });
      expect(res.status).toBe(404);

      const body = JSON.parse(res.body) as { error: string };
      expect(body.error).toBe('Not found');
    });
  });

  describe('/mcp endpoint error cases', () => {
    it('should return 400 for GET without session ID', async () => {
      const res = await makeRequest({
        host,
        port,
        method: 'GET',
        path: '/mcp',
        headers: { Accept: 'text/event-stream' },
      });
      expect(res.status).toBe(400);

      const body = JSON.parse(res.body) as { error: string };
      expect(body.error).toContain('mcp-session-id');
    });

    it('should return 404 for GET with unknown session ID', async () => {
      const res = await makeRequest({
        host,
        port,
        method: 'GET',
        path: '/mcp',
        headers: { 'mcp-session-id': 'nonexistent-session-id' },
      });
      expect(res.status).toBe(404);

      const body = JSON.parse(res.body) as { error: string };
      expect(body.error).toContain('Session not found');
    });

    it('should return 404 for DELETE with unknown session ID', async () => {
      const res = await makeRequest({
        host,
        port,
        method: 'DELETE',
        path: '/mcp',
        headers: { 'mcp-session-id': 'nonexistent-session-id' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('MCP session lifecycle', () => {
    let sessionId: string | undefined;

    it('should create a session via POST /mcp with initialize', async () => {
      const res = await makeRequest({
        host,
        port,
        method: 'POST',
        path: '/mcp',
        headers: { Accept: MCP_ACCEPT },
        body: MCP_INIT_MESSAGE,
      });

      expect(res.status).toBe(200);
      sessionId = res.headers['mcp-session-id'] as string | undefined;
      expect(sessionId).toBeTruthy();

      // Response may be SSE or plain JSON depending on SDK version
      const body = parseSSEBody(res.body) as {
        jsonrpc: string;
        id: number;
        result: { serverInfo: { name: string } };
      };
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(1);
      expect(body.result).toBeDefined();
      expect(body.result.serverInfo.name).toBe('limps');
    });

    it('should show session count in /health after creating session', async () => {
      const res = await makeRequest({ host, port, method: 'GET', path: '/health' });
      const body = JSON.parse(res.body) as { sessions: number };
      expect(body.sessions).toBeGreaterThanOrEqual(1);
    });

    it('should handle notifications on an existing session', async () => {
      expect(sessionId).toBeTruthy();

      const notifiedMsg = JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      const res = await makeRequest({
        host,
        port,
        method: 'POST',
        path: '/mcp',
        headers: { 'mcp-session-id': sessionId!, Accept: MCP_ACCEPT },
        body: notifiedMsg,
      });

      // Notification responses can be 200, 202, or 204
      expect([200, 202, 204]).toContain(res.status);
    });

    it('should clean up session via DELETE', async () => {
      expect(sessionId).toBeTruthy();

      const res = await makeRequest({
        host,
        port,
        method: 'DELETE',
        path: '/mcp',
        headers: { 'mcp-session-id': sessionId! },
      });

      expect(res.status).toBe(200);

      // Session should no longer exist
      const res2 = await makeRequest({
        host,
        port,
        method: 'GET',
        path: '/mcp',
        headers: { 'mcp-session-id': sessionId! },
      });
      expect(res2.status).toBe(404);
    });
  });

  describe('body size enforcement', () => {
    it('should reject requests with Content-Length exceeding maxBodySize', async () => {
      // Default maxBodySize is 10MB; send a request claiming to be 20MB
      const smallBody = '{}';
      const res = await makeRequest({
        host,
        port,
        method: 'POST',
        path: '/mcp',
        headers: { Accept: MCP_ACCEPT },
        body: smallBody,
        contentLengthOverride: (20 * 1024 * 1024).toString(),
      });

      expect(res.status).toBe(413);
      const body = JSON.parse(res.body) as { error: string };
      expect(body.error).toBe('Payload Too Large');
    });
  });
});

// =============================================================================
// Rate limiting (isolated server to avoid cross-test interference)
// =============================================================================

describe('HTTP Server rate limiting', () => {
  let testDir: string;
  let child: ChildProcess | null = null;
  const port = randomPort();
  const host = '127.0.0.1';

  beforeAll(async () => {
    testDir = join(tmpdir(), `limps-http-ratelimit-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const configPath = createTestConfig(testDir, {
      server: {
        port,
        host,
        rateLimit: { maxRequests: 5, windowMs: 60000 },
      },
    });
    child = await spawnDaemon(configPath, host, port);
  }, 20_000);

  afterAll(async () => {
    await killDaemon(child);
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should allow requests up to the limit then return 429', async () => {
    // waitForHealth consumed 1 request, so we have 4 left
    // Send 4 more that should succeed
    for (let i = 0; i < 4; i++) {
      const res = await makeRequest({ host, port, method: 'GET', path: '/health' });
      expect(res.status).toBe(200);
    }

    // Next request should be rate limited
    const blocked = await makeRequest({ host, port, method: 'GET', path: '/health' });
    expect(blocked.status).toBe(429);

    const body = JSON.parse(blocked.body) as { error: string };
    expect(body.error).toBe('Too Many Requests');
    expect(blocked.headers['retry-after']).toBeDefined();
  });
});

// =============================================================================
// maxSessions enforcement (isolated server with maxSessions=2)
// =============================================================================

describe('HTTP Server maxSessions enforcement', () => {
  let testDir: string;
  let child: ChildProcess | null = null;
  const port = randomPort();
  const host = '127.0.0.1';

  beforeAll(async () => {
    testDir = join(tmpdir(), `limps-http-maxsess-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const configPath = createTestConfig(testDir, {
      server: {
        port,
        host,
        maxSessions: 2,
        rateLimit: { maxRequests: 1000, windowMs: 60000 },
      },
    });
    child = await spawnDaemon(configPath, host, port);
  }, 20_000);

  afterAll(async () => {
    await killDaemon(child);
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should reject new sessions when maxSessions is reached', async () => {
    // Create maxSessions (2) sessions
    const sessionIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      const res = await makeRequest({
        host,
        port,
        method: 'POST',
        path: '/mcp',
        headers: { Accept: MCP_ACCEPT },
        body: MCP_INIT_MESSAGE,
      });
      expect(res.status).toBe(200);
      const sid = res.headers['mcp-session-id'] as string;
      expect(sid).toBeTruthy();
      sessionIds.push(sid);
    }

    // 3rd session should be rejected with 503
    const res = await makeRequest({
      host,
      port,
      method: 'POST',
      path: '/mcp',
      headers: { Accept: MCP_ACCEPT },
      body: MCP_INIT_MESSAGE,
    });
    expect(res.status).toBe(503);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe('Too Many Sessions');

    // Clean up one session
    await makeRequest({
      host,
      port,
      method: 'DELETE',
      path: '/mcp',
      headers: { 'mcp-session-id': sessionIds[0] },
    });

    // Now a new session should succeed
    const res2 = await makeRequest({
      host,
      port,
      method: 'POST',
      path: '/mcp',
      headers: { Accept: MCP_ACCEPT },
      body: MCP_INIT_MESSAGE,
    });
    expect(res2.status).toBe(200);
    expect(res2.headers['mcp-session-id']).toBeTruthy();
  });
});

// =============================================================================
// Duplicate daemon prevention (PID file locking)
// =============================================================================

describe('HTTP Server duplicate daemon prevention', () => {
  let testDir: string;
  let child1: ChildProcess | null = null;
  let child2: ChildProcess | null = null;
  const port = randomPort();
  const host = '127.0.0.1';

  beforeAll(() => {
    testDir = join(tmpdir(), `limps-http-dup-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(async () => {
    await killDaemon(child1);
    await killDaemon(child2);
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should prevent a second daemon from starting on the same port', async () => {
    const configPath = createTestConfig(testDir, {
      server: { port, host },
    });

    child1 = await spawnDaemon(configPath, host, port);

    // Attempt to start second daemon on SAME port — should fail because port is in use
    const configPath2 = createTestConfig(join(testDir, 'second'), {
      dataPath: join(testDir, 'data2'),
      server: { port, host }, // Same port as first daemon
    });

    let stderr2 = '';
    child2 = spawn(process.execPath, [ENTRY_PATH, configPath2], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    child2.stderr?.on('data', (data: Buffer) => {
      stderr2 += data.toString();
    });

    const exitCode = await new Promise<number | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 5000);
      child2?.on('close', (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    expect(exitCode).toBe(1);
    expect(stderr2).toContain('already running');
  }, 20_000);
});
