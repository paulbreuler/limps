import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeObsidianMcp } from '../src/mcp/client.js';

interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

function startServer(
  handler: (
    req: http.IncomingMessage,
    body: string
  ) => { status: number; headers?: Record<string, string | undefined>; body?: string }
): Promise<TestServer> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const out = handler(req, body);
        res.statusCode = out.status;
        for (const [k, v] of Object.entries(out.headers ?? {})) {
          if (v === undefined) continue;
          res.setHeader(k, v);
        }
        res.end(out.body ?? '');
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise<void>((done, reject) => {
            server.close((err) => {
              if (err) reject(err);
              else done();
            });
          }),
      });
    });
  });
}

function createFakeStdioMcpScript(): string {
  const dir = mkdtempSync(join(tmpdir(), 'limps-obsidian-mcp-'));
  const scriptPath = join(dir, 'fake-mcp.js');
  writeFileSync(
    scriptPath,
    `
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  if (msg.method === 'initialize') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'fake-stdio-mcp', version: '0.1.0' }
      }
    }) + '\\n');
    return;
  }

  if (msg.method === 'tools/list') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        tools: [{ name: 'search_notes' }, { name: 'open_note' }, { name: 'list_tags' }]
      }
    }) + '\\n');
    setTimeout(() => process.exit(0), 10);
  }
});
`.trim(),
    'utf8'
  );
  return scriptPath;
}

test('probeObsidianMcp succeeds via JSON-RPC initialize + tools/list', async () => {
  const server = await startServer((req, body) => {
    if (req.method !== 'POST' || req.url !== '/') {
      return { status: 404 };
    }

    const payload = JSON.parse(body) as { id?: number; method?: string };
    if (payload.method === 'initialize') {
      return {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'mcp-session-id': 'session-1',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: payload.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            serverInfo: { name: 'obsidian-mcp', version: '1.0.0' },
          },
        }),
      };
    }

    if (payload.method === 'tools/list') {
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: payload.id,
          result: {
            tools: [{ name: 'search_notes' }, { name: 'open_note' }],
          },
        }),
      };
    }

    return { status: 400 };
  });

  try {
    const result = await probeObsidianMcp({
      endpoint: server.baseUrl,
      timeoutMs: 2000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.transport, 'http-jsonrpc');
    assert.equal(result.serverInfo?.name, 'obsidian-mcp');
    assert.equal(result.toolsCount, 2);
  } finally {
    await server.close();
  }
});

test('probeObsidianMcp falls back to /health endpoint when JSON-RPC is unavailable', async () => {
  const server = await startServer((req) => {
    if (req.method === 'GET' && req.url === '/health') {
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      };
    }
    return { status: 404 };
  });

  try {
    const result = await probeObsidianMcp({
      endpoint: server.baseUrl,
      timeoutMs: 2000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.transport, 'http-health');
  } finally {
    await server.close();
  }
});

test('probeObsidianMcp returns clear error when unreachable', async () => {
  const result = await probeObsidianMcp({
    endpoint: 'http://127.0.0.1:9',
    timeoutMs: 200,
  });

  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /Unable to reach Obsidian MCP endpoint/);
});

test('probeObsidianMcp succeeds via stdio JSON-RPC handshake', async () => {
  const scriptPath = createFakeStdioMcpScript();
  const result = await probeObsidianMcp({
    transport: 'stdio',
    command: process.execPath,
    args: [scriptPath],
    timeoutMs: 2000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.transport, 'stdio-jsonrpc');
  assert.equal(result.serverInfo?.name, 'fake-stdio-mcp');
  assert.equal(result.toolsCount, 3);
});

test('probeObsidianMcp returns spawn error for invalid stdio command', async () => {
  const result = await probeObsidianMcp({
    transport: 'stdio',
    command: '/definitely/missing/obsidian-mcp',
    args: [],
    timeoutMs: 1000,
  });

  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /Failed to spawn Obsidian MCP stdio command/);
});
