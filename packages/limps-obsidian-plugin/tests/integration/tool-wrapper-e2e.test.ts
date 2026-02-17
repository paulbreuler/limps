import test from 'node:test';
import assert from 'node:assert/strict';
import { LimpsToolWrapper } from '../../src/mcp/tool-wrapper.js';
import type { McpClientManager, CallToolResult, CliOptions } from '../../src/mcp/client-manager.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

interface MockClientOptions {
  connected: boolean;
  callToolResult?: CallToolResult;
  callToolError?: Error;
  cliResult?: unknown;
  cliError?: Error;
}

function createMockClient(opts: MockClientOptions): McpClientManager {
  return {
    isConnected: () => opts.connected,
    callTool: async (_name: string, _args: Record<string, unknown>): Promise<CallToolResult> => {
      if (opts.callToolError) throw opts.callToolError;
      return opts.callToolResult ?? { content: [] };
    },
    callToolViaCli: async (
      _name: string,
      _args: Record<string, unknown>,
      _cliOptions: CliOptions
    ): Promise<unknown> => {
      if (opts.cliError) throw opts.cliError;
      return opts.cliResult ?? null;
    },
  } as unknown as McpClientManager;
}

const CLI_OPTIONS: CliOptions = {
  limpsPath: '/usr/local/bin/limps',
  cwd: '/tmp/test',
  timeoutMs: 5000,
};

// ---------------------------------------------------------------------------
// Dual-mode tests: MCP vs CLI for key operations
// ---------------------------------------------------------------------------

test('dual-mode: ping via MCP returns parsed JSON', async () => {
  const client = createMockClient({
    connected: true,
    callToolResult: {
      content: [{ type: 'text', text: '{"pong":true,"timestamp":"2026-02-14T00:00:00Z"}' }],
    },
  });
  const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
  const result = await wrapper.ping();

  assert.equal(result.success, true);
  assert.deepEqual(result.data, { pong: true, timestamp: '2026-02-14T00:00:00Z' });
});

test('dual-mode: ping via CLI fallback returns data', async () => {
  const client = createMockClient({
    connected: false,
    cliResult: { pong: true },
  });
  const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
  const result = await wrapper.ping();

  assert.equal(result.success, true);
  assert.deepEqual(result.data, { pong: true });
});

test('dual-mode: searchDocs via MCP returns results', async () => {
  const client = createMockClient({
    connected: true,
    callToolResult: {
      content: [{ type: 'text', text: '{"results":[{"path":"plans/test.md"}]}' }],
    },
  });
  const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
  const result = await wrapper.searchDocs('test query', 5);

  assert.equal(result.success, true);
  const data = result.data as { results: Array<{ path: string }> };
  assert.equal(data.results[0].path, 'plans/test.md');
});

test('dual-mode: searchDocs via CLI fallback', async () => {
  const client = createMockClient({
    connected: false,
    cliResult: { results: [] },
  });
  const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
  const result = await wrapper.searchDocs('query');

  assert.equal(result.success, true);
  assert.deepEqual(result.data, { results: [] });
});

test('dual-mode: listPlans via MCP', async () => {
  const client = createMockClient({
    connected: true,
    callToolResult: {
      content: [{ type: 'text', text: '{"plans":[]}' }],
    },
  });
  const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
  const result = await wrapper.listPlans();

  assert.equal(result.success, true);
  assert.deepEqual(result.data, { plans: [] });
});

test('dual-mode: listPlans via CLI fallback', async () => {
  const client = createMockClient({
    connected: false,
    cliResult: { plans: ['plan-1', 'plan-2'] },
  });
  const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
  const result = await wrapper.listPlans();

  assert.equal(result.success, true);
  assert.deepEqual(result.data, { plans: ['plan-1', 'plan-2'] });
});

test('dual-mode: graphHealth via MCP', async () => {
  const client = createMockClient({
    connected: true,
    callToolResult: {
      content: [{ type: 'text', text: '{"healthy":true}' }],
    },
  });
  const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
  const result = await wrapper.graphHealth();

  assert.equal(result.success, true);
  assert.deepEqual(result.data, { healthy: true });
});

test('dual-mode: MCP error returns success=false', async () => {
  const client = createMockClient({
    connected: true,
    callToolResult: {
      content: [{ type: 'text', text: 'Tool execution failed' }],
      isError: true,
    },
  });
  const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
  const result = await wrapper.searchDocs('fail');

  assert.equal(result.success, false);
  assert.ok(result.error?.includes('Tool execution failed'));
});

test('dual-mode: CLI error returns success=false', async () => {
  const client = createMockClient({
    connected: false,
    cliError: new Error('ENOENT: limps not found'),
  });
  const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
  const result = await wrapper.ping();

  assert.equal(result.success, false);
  assert.ok(result.error?.includes('CLI fallback'));
});

test('dual-mode: createDoc forwards all args via MCP', async () => {
  const capturedCalls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    isConnected: () => true,
    callTool: async (name: string, args: Record<string, unknown>): Promise<CallToolResult> => {
      capturedCalls.push({ name, args });
      return { content: [{ type: 'text', text: '{"created":true}' }] };
    },
  } as unknown as McpClientManager;

  const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
  await wrapper.createDoc('plans/new.md', '# New Plan', { status: 'GAP' });

  assert.equal(capturedCalls[0].name, 'create_doc');
  assert.equal(capturedCalls[0].args.path, 'plans/new.md');
  assert.equal(capturedCalls[0].args.content, '# New Plan');
  assert.deepEqual(capturedCalls[0].args.metadata, { status: 'GAP' });
});

test('dual-mode: updateTaskStatus forwards via MCP', async () => {
  const capturedCalls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    isConnected: () => true,
    callTool: async (name: string, args: Record<string, unknown>): Promise<CallToolResult> => {
      capturedCalls.push({ name, args });
      return { content: [{ type: 'text', text: '{}' }] };
    },
  } as unknown as McpClientManager;

  const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
  await wrapper.updateTaskStatus('0001-feature#002', 'PASS');

  assert.equal(capturedCalls[0].name, 'update_task_status');
  assert.equal(capturedCalls[0].args.taskId, '0001-feature#002');
  assert.equal(capturedCalls[0].args.status, 'PASS');
});
