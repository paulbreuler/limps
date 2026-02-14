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
// Tests: MCP path
// ---------------------------------------------------------------------------

test('LimpsToolWrapper - MCP path', async (t) => {
  await t.test('parses JSON text content from MCP result', async () => {
    const client = createMockClient({
      connected: true,
      callToolResult: {
        content: [{ type: 'text', text: '{"pong":true}' }],
      },
    });
    const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
    const result = await wrapper.ping();
    assert.equal(result.success, true);
    assert.deepEqual(result.data, { pong: true });
  });

  await t.test('returns non-JSON text as string data', async () => {
    const client = createMockClient({
      connected: true,
      callToolResult: {
        content: [{ type: 'text', text: 'plain text response' }],
      },
    });
    const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
    const result = await wrapper.ping();
    assert.equal(result.success, true);
    assert.equal(result.data, 'plain text response');
  });

  await t.test('handles isError flag', async () => {
    const client = createMockClient({
      connected: true,
      callToolResult: {
        content: [{ type: 'text', text: 'Something went wrong' }],
        isError: true,
      },
    });
    const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
    const result = await wrapper.searchDocs('test');
    assert.equal(result.success, false);
    assert.equal(result.error, 'Something went wrong');
  });

  await t.test('handles empty content array', async () => {
    const client = createMockClient({
      connected: true,
      callToolResult: { content: [] },
    });
    const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
    const result = await wrapper.listPlans();
    assert.equal(result.success, true);
    assert.equal(result.data, undefined);
  });

  await t.test('handles callTool throwing', async () => {
    const client = createMockClient({
      connected: true,
      callToolError: new Error('Connection reset'),
    });
    const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
    const result = await wrapper.graphHealth();
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('Connection reset'));
  });
});

// ---------------------------------------------------------------------------
// Tests: CLI fallback path
// ---------------------------------------------------------------------------

test('LimpsToolWrapper - CLI fallback', async (t) => {
  await t.test('falls back to CLI when MCP disconnected', async () => {
    const client = createMockClient({
      connected: false,
      cliResult: { plans: [] },
    });
    const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
    const result = await wrapper.listPlans();
    assert.equal(result.success, true);
    assert.deepEqual(result.data, { plans: [] });
  });

  await t.test('handles CLI error', async () => {
    const client = createMockClient({
      connected: false,
      cliError: new Error('command not found: limps'),
    });
    const wrapper = new LimpsToolWrapper(client, CLI_OPTIONS);
    const result = await wrapper.ping();
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('CLI fallback'));
    assert.ok(result.error?.includes('command not found'));
  });
});

// ---------------------------------------------------------------------------
// Tests: Method argument forwarding
// ---------------------------------------------------------------------------

test('LimpsToolWrapper - argument forwarding', async (t) => {
  const capturedCalls: { name: string; args: Record<string, unknown> }[] = [];

  function createCapturingClient(): McpClientManager {
    return {
      isConnected: () => true,
      callTool: async (name: string, args: Record<string, unknown>): Promise<CallToolResult> => {
        capturedCalls.push({ name, args });
        return { content: [{ type: 'text', text: '{}' }] };
      },
    } as unknown as McpClientManager;
  }

  await t.test('createDoc forwards path, content, metadata', async () => {
    capturedCalls.length = 0;
    const wrapper = new LimpsToolWrapper(createCapturingClient(), CLI_OPTIONS);
    await wrapper.createDoc('plans/test.md', '# Test', { status: 'GAP' });
    assert.equal(capturedCalls[0].name, 'create_doc');
    assert.equal(capturedCalls[0].args.path, 'plans/test.md');
    assert.equal(capturedCalls[0].args.content, '# Test');
    assert.deepEqual(capturedCalls[0].args.metadata, { status: 'GAP' });
  });

  await t.test('searchDocs forwards query and limit', async () => {
    capturedCalls.length = 0;
    const wrapper = new LimpsToolWrapper(createCapturingClient(), CLI_OPTIONS);
    await wrapper.searchDocs('auth bug', 5);
    assert.equal(capturedCalls[0].name, 'search_docs');
    assert.equal(capturedCalls[0].args.query, 'auth bug');
    assert.equal(capturedCalls[0].args.limit, 5);
  });

  await t.test('searchDocs omits limit when not provided', async () => {
    capturedCalls.length = 0;
    const wrapper = new LimpsToolWrapper(createCapturingClient(), CLI_OPTIONS);
    await wrapper.searchDocs('auth bug');
    assert.equal(capturedCalls[0].args.limit, undefined);
  });

  await t.test('graphSearch sends command and query', async () => {
    capturedCalls.length = 0;
    const wrapper = new LimpsToolWrapper(createCapturingClient(), CLI_OPTIONS);
    await wrapper.graphSearch('authentication');
    assert.equal(capturedCalls[0].name, 'graph');
    assert.equal(capturedCalls[0].args.command, 'search');
    assert.equal(capturedCalls[0].args.query, 'authentication');
  });

  await t.test('updateTaskStatus forwards taskId and status', async () => {
    capturedCalls.length = 0;
    const wrapper = new LimpsToolWrapper(createCapturingClient(), CLI_OPTIONS);
    await wrapper.updateTaskStatus('0001-feature#002', 'PASS');
    assert.equal(capturedCalls[0].name, 'update_task_status');
    assert.equal(capturedCalls[0].args.taskId, '0001-feature#002');
    assert.equal(capturedCalls[0].args.status, 'PASS');
  });

  await t.test('applyProposal includes confirm: true', async () => {
    capturedCalls.length = 0;
    const wrapper = new LimpsToolWrapper(createCapturingClient(), CLI_OPTIONS);
    await wrapper.applyProposal('proposal-123');
    assert.equal(capturedCalls[0].name, 'apply_proposal');
    assert.equal(capturedCalls[0].args.proposalId, 'proposal-123');
    assert.equal(capturedCalls[0].args.confirm, true);
  });

  await t.test('deleteDoc forwards path', async () => {
    capturedCalls.length = 0;
    const wrapper = new LimpsToolWrapper(createCapturingClient(), CLI_OPTIONS);
    await wrapper.deleteDoc('plans/old.md');
    assert.equal(capturedCalls[0].name, 'delete_doc');
    assert.equal(capturedCalls[0].args.path, 'plans/old.md');
  });

  await t.test('updateDoc omits undefined fields', async () => {
    capturedCalls.length = 0;
    const wrapper = new LimpsToolWrapper(createCapturingClient(), CLI_OPTIONS);
    await wrapper.updateDoc('plans/test.md');
    assert.equal(capturedCalls[0].name, 'update_doc');
    assert.equal(capturedCalls[0].args.path, 'plans/test.md');
    assert.equal(capturedCalls[0].args.content, undefined);
    assert.equal(capturedCalls[0].args.metadata, undefined);
  });
});
