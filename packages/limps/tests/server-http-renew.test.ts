/**
 * Tests for the POST /mcp/renew endpoint.
 * Spawns a real HTTP server and verifies session renewal behavior.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { spawn, type ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import { request as httpRequest, type IncomingMessage } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENTRY_PATH = join(__dirname, '..', 'dist', 'server-http-entry.js');

const MCP_ACCEPT = 'application/json, text/event-stream';

const MCP_INIT_MESSAGE = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'renew-test', version: '0.0.1' },
  },
});

function makeRequest(options: {
  host: string;
  port: number;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}): Promise<{ status: number; headers: IncomingMessage['headers']; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: options.host,
        port: options.port,
        method: options.method,
        path: options.path,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers ?? {}),
          ...(options.body ? { 'Content-Length': Buffer.byteLength(options.body).toString() } : {}),
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

function randomPort(): number {
  return 30000 + Math.floor(Math.random() * 20000);
}

async function spawnDaemon(configPath: string, host: string, port: number): Promise<ChildProcess> {
  const child = spawn(process.execPath, [ENTRY_PATH, configPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  child.stderr?.on('data', () => {});

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

describe('POST /mcp/renew', () => {
  let testDir: string;
  let child: ChildProcess | null = null;
  const port = randomPort();
  const host = '127.0.0.1';

  beforeAll(async () => {
    testDir = join(tmpdir(), `limps-renew-test-${Date.now()}`);
    const plansDir = join(testDir, 'plans');
    const planDir = join(plansDir, '0001-test');
    mkdirSync(planDir, { recursive: true });
    writeFileSync(
      join(planDir, '0001-test-plan.md'),
      '---\nname: Test\nworkType: feature\nstatus: GAP\n---\n\n# Test Plan\n',
      'utf-8'
    );
    const configPath = join(testDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        plansPath: plansDir,
        dataPath: join(testDir, 'data'),
        scoring: { weights: { dependency: 40, priority: 30, workload: 30 }, biases: {} },
        server: { port, host, rateLimit: { maxRequests: 1000, windowMs: 60000 } },
      }),
      'utf-8'
    );
    child = await spawnDaemon(configPath, host, port);
  }, 20_000);

  afterAll(async () => {
    await killDaemon(child);
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return 400 without session ID header', async () => {
    const res = await makeRequest({
      host,
      port,
      method: 'POST',
      path: '/mcp/renew',
    });
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('mcp-session-id');
  });

  it('should return 404 for unknown session', async () => {
    const res = await makeRequest({
      host,
      port,
      method: 'POST',
      path: '/mcp/renew',
      headers: { 'mcp-session-id': 'nonexistent-session' },
    });
    expect(res.status).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('not found');
  });

  it('should renew a valid session', async () => {
    // Create a session via MCP initialize
    const initRes = await makeRequest({
      host,
      port,
      method: 'POST',
      path: '/mcp',
      headers: { Accept: MCP_ACCEPT },
      body: MCP_INIT_MESSAGE,
    });
    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers['mcp-session-id'] as string;
    expect(sessionId).toBeTruthy();

    // Renew the session
    const renewRes = await makeRequest({
      host,
      port,
      method: 'POST',
      path: '/mcp/renew',
      headers: { 'mcp-session-id': sessionId },
    });
    expect(renewRes.status).toBe(200);
    const body = JSON.parse(renewRes.body);
    expect(body.renewed).toBe(true);
    expect(typeof body.expiresAt).toBe('string');

    // Verify expiresAt is in the future
    const expiresAt = new Date(body.expiresAt);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
