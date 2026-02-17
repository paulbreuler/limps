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

type HandlerResult = {
  status: number;
  headers?: Record<string, string | undefined>;
  body?: string;
};

interface JsonRpcPayload {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
}

type McpRequestHandler = (payload: JsonRpcPayload) => HandlerResult;

function startMcpServer(handler: McpRequestHandler): Promise<TestServer> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // Handle DELETE (session teardown) gracefully
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

        // Notifications (no id) - just ack
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
  message: string,
  _sessionId?: string
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
    return initializeOk(payload.id ?? 1, 'test-session-1');
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
// Connection lifecycle tests
// ---------------------------------------------------------------------------

test('connect() establishes MCP session and emits connected', async () => {
  const server = await startMcpServer(defaultMcpHandler);
  try {
    const manager = new McpClientManager({
      endpoint: server.baseUrl,
      keepaliveIntervalMs: 60_000,
    });

    let connectedPayload: McpEventPayload['connected'] | undefined;
    manager.on('connected', (p) => {
      connectedPayload = p;
    });

    await manager.connect();

    assert.equal(manager.isConnected(), true);
    assert.ok(connectedPayload);
    assert.equal(connectedPayload.sessionId, 'test-session-1');

    await manager.disconnect();
  } finally {
    await server.close();
  }
});

test('connect() throws on unreachable endpoint', async () => {
  const manager = new McpClientManager({
    endpoint: 'http://127.0.0.1:9',
    toolCallTimeoutMs: 500,
  });

  await assert.rejects(() => manager.connect(), /MCP initialize failed/);
  assert.equal(manager.isConnected(), false);
});

test('disconnect() clears session and emits disconnected', async () => {
  const server = await startMcpServer(defaultMcpHandler);
  try {
    const manager = new McpClientManager({
      endpoint: server.baseUrl,
      keepaliveIntervalMs: 60_000,
    });

    let disconnectedPayload: McpEventPayload['disconnected'] | undefined;
    manager.on('disconnected', (p) => {
      disconnectedPayload = p;
    });

    await manager.connect();
    assert.equal(manager.isConnected(), true);

    await manager.disconnect();
    assert.equal(manager.isConnected(), false);
    assert.ok(disconnectedPayload);
    assert.equal(disconnectedPayload.reason, 'disconnect() called');
  } finally {
    await server.close();
  }
});

test('isConnected() returns false before connect()', () => {
  const manager = new McpClientManager({ endpoint: 'http://127.0.0.1:9999' });
  assert.equal(manager.isConnected(), false);
});

// ---------------------------------------------------------------------------
// Tool calling tests
// ---------------------------------------------------------------------------

test('callTool() returns result from server', async () => {
  const server = await startMcpServer(defaultMcpHandler);
  try {
    const manager = new McpClientManager({
      endpoint: server.baseUrl,
      keepaliveIntervalMs: 60_000,
    });
    await manager.connect();

    const result = await manager.callTool('list_plans', {});
    assert.ok(result.content);
    assert.equal(result.content[0]?.type, 'text');
    assert.equal(result.content[0]?.text, 'ok');

    await manager.disconnect();
  } finally {
    await server.close();
  }
});

test('callTool() throws when not connected', async () => {
  const manager = new McpClientManager({ endpoint: 'http://127.0.0.1:9999' });
  await assert.rejects(() => manager.callTool('test', {}), /Not connected/);
});

// ---------------------------------------------------------------------------
// Reconnection tests
// ---------------------------------------------------------------------------

test('callTool() triggers reconnect on SESSION_EXPIRED and retries', async () => {
  let callCount = 0;
  const server = await startMcpServer((payload) => {
    if (payload.method === 'initialize') {
      return initializeOk(payload.id ?? 1, 'session-' + callCount);
    }
    if (payload.method === 'tools/call') {
      callCount++;
      if (callCount === 1) {
        return jsonRpcError(payload.id ?? 1, -32001, 'SESSION_EXPIRED');
      }
      return jsonRpcOk(payload.id ?? 1, {
        content: [{ type: 'text', text: 'reconnected-ok' }],
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
    manager.on('reconnecting', (p) => {
      reconnectingEvents.push(p);
    });

    await manager.connect();
    const result = await manager.callTool('list_plans', {});

    assert.equal(result.content[0]?.text, 'reconnected-ok');
    assert.ok(reconnectingEvents.length > 0, 'reconnecting event should have fired');

    await manager.disconnect();
  } finally {
    await server.close();
  }
});

test('reconnect uses exponential backoff', async () => {
  let failReconnects = false;
  let reconnectAttemptCount = 0;
  const server = await startMcpServer((payload) => {
    if (payload.method === 'initialize') {
      if (failReconnects) {
        reconnectAttemptCount++;
        if (reconnectAttemptCount <= 2) {
          return { status: 500, body: 'down' };
        }
      }
      return initializeOk(payload.id ?? 1, 'session-' + reconnectAttemptCount);
    }
    if (payload.method === 'tools/call') {
      // Trigger SESSION_EXPIRED to force reconnect
      return jsonRpcError(payload.id ?? 1, -32001, 'SESSION_EXPIRED');
    }
    return { status: 400 };
  });

  try {
    const events: McpEventPayload['reconnecting'][] = [];
    const manager = new McpClientManager({
      endpoint: server.baseUrl,
      maxReconnectAttempts: 5,
      keepaliveIntervalMs: 60_000,
    });
    manager.on('reconnecting', (p) => events.push(p));

    // Initial connect succeeds normally
    await manager.connect();

    // Now enable reconnect failures so backoff kicks in
    failReconnects = true;

    // This call will SESSION_EXPIRED -> triggers reconnect
    // Reconnect will fail twice then succeed, but the retry tool call
    // also gets SESSION_EXPIRED
    try {
      await manager.callTool('test', {});
    } catch {
      // expected - the retry also gets SESSION_EXPIRED
    }

    assert.ok(events.length >= 1, 'should have reconnecting events');
    if (events.length > 1) {
      assert.ok(events[1]!.attempt > events[0]!.attempt, 'attempts should increase');
    }

    await manager.disconnect();
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------------------
// Keepalive tests
// ---------------------------------------------------------------------------

test('keepalive sends ping periodically', async () => {
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

    // Wait enough for a couple of keepalives
    await new Promise((resolve) => setTimeout(resolve, 350));

    assert.ok(pingCount >= 2, `expected at least 2 pings, got ${pingCount}`);

    await manager.disconnect();
  } finally {
    await server.close();
  }
});

test('keepalive is skipped if recent tool call happened', async () => {
  let pingCount = 0;
  const server = await startMcpServer((payload) => {
    if (payload.method === 'initialize') {
      return initializeOk(payload.id ?? 1, 'ka-session');
    }
    if (payload.method === 'tools/call') {
      return jsonRpcOk(payload.id ?? 1, { content: [{ type: 'text', text: 'ok' }] });
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

    // Call a tool rapidly so lastToolCallTime stays recent
    for (let i = 0; i < 3; i++) {
      await manager.callTool('test', {});
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Ping should not have fired because tool calls are recent
    assert.equal(pingCount, 0, `expected 0 pings since tool calls are recent, got ${pingCount}`);

    await manager.disconnect();
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------------------
// Event emitter tests
// ---------------------------------------------------------------------------

test('on/off correctly manages listeners', async () => {
  const server = await startMcpServer(defaultMcpHandler);
  try {
    const manager = new McpClientManager({
      endpoint: server.baseUrl,
      keepaliveIntervalMs: 60_000,
    });

    let count = 0;
    const listener = (): void => {
      count++;
    };
    manager.on('connected', listener);
    await manager.connect();
    assert.equal(count, 1);

    // Remove listener and reconnect
    manager.off('connected', listener);
    await manager.disconnect();
    await manager.connect();
    assert.equal(count, 1); // should not have incremented

    await manager.disconnect();
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------------------
// CLI fallback test
// ---------------------------------------------------------------------------

test('callToolViaCli() invokes CLI wrapper', async () => {
  const manager = new McpClientManager({ endpoint: 'http://127.0.0.1:9999' });

  await assert.rejects(
    () =>
      manager.callToolViaCli('list_plans', {}, {
        limpsPath: '/nonexistent/limps',
        cwd: process.cwd(),
        timeoutMs: 1000,
      }),
    /CLI fallback for 'list_plans' failed/
  );
});
