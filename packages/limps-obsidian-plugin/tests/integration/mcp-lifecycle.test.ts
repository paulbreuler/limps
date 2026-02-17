import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { McpClientManager } from '../../src/mcp/client-manager.js';
import type { McpEventPayload } from '../../src/mcp/client-manager.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

interface JsonRpcPayload {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
}

type HandlerResult = {
  status: number;
  headers?: Record<string, string | undefined>;
  body?: string;
};

type McpRequestHandler = (payload: JsonRpcPayload) => HandlerResult;

function startMcpServer(handler: McpRequestHandler): Promise<TestServer> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'DELETE') {
        res.statusCode = 200;
        res.end('');
        return;
      }

      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const trimmed = body.trim();
        if (!trimmed) {
          res.statusCode = 400;
          res.end('');
          return;
        }

        let payload: JsonRpcPayload;
        try {
          payload = JSON.parse(trimmed) as JsonRpcPayload;
        } catch {
          res.statusCode = 400;
          res.end('');
          return;
        }

        if (payload.method === 'notifications/initialized') {
          res.statusCode = 200;
          res.end('');
          return;
        }

        const out = handler(payload);
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

function jsonRpcOk(id: number, result: unknown, sessionId?: string): HandlerResult {
  const headers: Record<string, string | undefined> = {
    'content-type': 'application/json',
  };
  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }
  return {
    status: 200,
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, result }),
  };
}

function jsonRpcError(
  id: number | null,
  code: number,
  message: string
): HandlerResult {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }),
  };
}

function initializeOk(id: number, sessionId: string): HandlerResult {
  return jsonRpcOk(
    id,
    {
      protocolVersion: '2024-11-05',
      capabilities: {},
      serverInfo: { name: 'test-mcp', version: '0.1.0' },
    },
    sessionId
  );
}

function defaultMcpHandler(payload: JsonRpcPayload): HandlerResult {
  if (payload.method === 'initialize') {
    return initializeOk(payload.id ?? 1, 'lifecycle-session');
  }
  if (payload.method === 'tools/call') {
    return jsonRpcOk(payload.id ?? 1, {
      content: [{ type: 'text', text: 'ok' }],
    });
  }
  if (payload.method === 'ping') {
    return jsonRpcOk(payload.id ?? 1, {});
  }
  return { status: 400 };
}

// ---------------------------------------------------------------------------
// Full lifecycle: connect -> tool call -> disconnect -> reconnect
// ---------------------------------------------------------------------------

test('full lifecycle: connect, call, disconnect, reconnect', async () => {
  const server = await startMcpServer(defaultMcpHandler);
  try {
    const events: string[] = [];
    const manager = new McpClientManager({
      endpoint: server.baseUrl,
      keepaliveIntervalMs: 60_000,
    });

    manager.on('connected', () => events.push('connected'));
    manager.on('disconnected', () => events.push('disconnected'));

    // Phase 1: connect
    await manager.connect();
    assert.equal(manager.isConnected(), true);
    assert.ok(events.includes('connected'));

    // Phase 2: tool call
    const result = await manager.callTool('ping', {});
    assert.ok(result.content);

    // Phase 3: disconnect
    await manager.disconnect();
    assert.equal(manager.isConnected(), false);
    assert.ok(events.includes('disconnected'));

    // Phase 4: reconnect
    await manager.connect();
    assert.equal(manager.isConnected(), true);
    assert.equal(events.filter((e) => e === 'connected').length, 2);

    await manager.disconnect();
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------------------
// Reconnection on SESSION_EXPIRED
// ---------------------------------------------------------------------------

test('automatic reconnect on SESSION_EXPIRED during tool call', async () => {
  let callCount = 0;
  const server = await startMcpServer((payload) => {
    if (payload.method === 'initialize') {
      return initializeOk(payload.id ?? 1, `session-${callCount}`);
    }
    if (payload.method === 'tools/call') {
      callCount++;
      if (callCount === 1) {
        return jsonRpcError(payload.id ?? 1, -32001, 'SESSION_EXPIRED');
      }
      return jsonRpcOk(payload.id ?? 1, {
        content: [{ type: 'text', text: 'retry-ok' }],
      });
    }
    if (payload.method === 'ping') {
      return jsonRpcOk(payload.id ?? 1, {});
    }
    return { status: 400 };
  });

  try {
    const reconnectingEvents: McpEventPayload['reconnecting'][] = [];
    const manager = new McpClientManager({
      endpoint: server.baseUrl,
      maxReconnectAttempts: 3,
      keepaliveIntervalMs: 60_000,
    });
    manager.on('reconnecting', (p) => reconnectingEvents.push(p));

    await manager.connect();
    const result = await manager.callTool('list_plans', {});

    assert.equal(result.content[0]?.text, 'retry-ok');
    assert.ok(reconnectingEvents.length > 0, 'should have fired reconnecting event');

    await manager.disconnect();
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------------------
// Keepalive scheduling
// ---------------------------------------------------------------------------

test('keepalive pings are sent on schedule', async () => {
  let pingCount = 0;
  const server = await startMcpServer((payload) => {
    if (payload.method === 'initialize') {
      return initializeOk(payload.id ?? 1, 'keepalive-session');
    }
    if (payload.method === 'ping') {
      pingCount++;
      return jsonRpcOk(payload.id ?? 1, {});
    }
    return { status: 400 };
  });

  try {
    const manager = new McpClientManager({
      endpoint: server.baseUrl,
      keepaliveIntervalMs: 100,
    });

    await manager.connect();
    await new Promise((resolve) => setTimeout(resolve, 350));

    assert.ok(pingCount >= 2, `expected >= 2 pings, got ${pingCount}`);

    await manager.disconnect();
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------------------
// CLI fallback when MCP unavailable
// ---------------------------------------------------------------------------

test('callToolViaCli throws descriptive error when limps path invalid', async () => {
  const manager = new McpClientManager({ endpoint: 'http://127.0.0.1:9999' });

  await assert.rejects(
    () =>
      manager.callToolViaCli('list_plans', {}, {
        limpsPath: '/nonexistent/limps-binary',
        cwd: process.cwd(),
        timeoutMs: 1000,
      }),
    /CLI fallback for 'list_plans' failed/
  );
});
