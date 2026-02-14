import test from 'node:test';
import assert from 'node:assert/strict';
import { runAutoProposals } from '../../src/workflows/auto-proposals.js';
import { NotificationManager } from '../../src/workflows/notification-manager.js';
import type { LimpsToolWrapper, ToolResult } from '../../src/mcp/tool-wrapper.js';

function mockWrapper(proposals: unknown[], applyResults?: Map<string, ToolResult>): LimpsToolWrapper {
  return {
    getProposals: async (): Promise<ToolResult> => ({
      success: true,
      data: { proposals },
    }),
    applyProposal: async (id: string): Promise<ToolResult> => {
      if (applyResults?.has(id)) {
        return applyResults.get(id)!;
      }
      return { success: true };
    },
  } as unknown as LimpsToolWrapper;
}

function mockFailingFetchWrapper(): LimpsToolWrapper {
  return {
    getProposals: async (): Promise<ToolResult> => ({
      success: false,
      error: 'daemon unreachable',
    }),
    applyProposal: async (): Promise<ToolResult> => ({ success: true }),
  } as unknown as LimpsToolWrapper;
}

test('runAutoProposals: applies eligible proposals from whitelist', async () => {
  const proposals = [
    { id: 'p1', type: 'frontmatter_cleanup', safe: true, description: 'fix fm' },
    { id: 'p2', type: 'staleness_update', safe: true, description: 'update stale' },
    { id: 'p3', type: 'unknown_type', safe: true, description: 'skip this' },
  ];

  const wrapper = mockWrapper(proposals);
  const mgr = new NotificationManager();

  const result = await runAutoProposals({
    wrapper,
    notificationManager: mgr,
    allowedTypes: ['frontmatter_cleanup', 'staleness_update', 'link_normalization'],
  });

  assert.equal(result.fetched, 3);
  assert.equal(result.eligible, 2);
  assert.equal(result.applied, 2);
  assert.equal(result.failed, 0);
});

test('runAutoProposals: returns empty result when no proposals', async () => {
  const wrapper = mockWrapper([]);
  const mgr = new NotificationManager();

  const result = await runAutoProposals({
    wrapper,
    notificationManager: mgr,
    allowedTypes: ['frontmatter_cleanup'],
  });

  assert.equal(result.fetched, 0);
  assert.equal(result.eligible, 0);
  assert.equal(result.applied, 0);
});

test('runAutoProposals: tracks failures', async () => {
  const proposals = [
    { id: 'p1', type: 'frontmatter_cleanup', safe: true },
    { id: 'p2', type: 'frontmatter_cleanup', safe: true },
  ];

  const applyResults = new Map<string, ToolResult>([
    ['p2', { success: false, error: 'write failed' }],
  ]);

  const wrapper = mockWrapper(proposals, applyResults);
  const mgr = new NotificationManager();

  const result = await runAutoProposals({
    wrapper,
    notificationManager: mgr,
    allowedTypes: ['frontmatter_cleanup'],
  });

  assert.equal(result.applied, 1);
  assert.equal(result.failed, 1);
  assert.ok(result.errors.length > 0);
});

test('runAutoProposals: handles fetch failure gracefully', async () => {
  const wrapper = mockFailingFetchWrapper();
  const mgr = new NotificationManager();

  const result = await runAutoProposals({
    wrapper,
    notificationManager: mgr,
    allowedTypes: ['frontmatter_cleanup'],
  });

  assert.equal(result.fetched, 0);
  assert.equal(result.applied, 0);
  assert.ok(result.errors.length > 0);
});

test('runAutoProposals: skips proposals without type', async () => {
  const proposals = [
    { id: 'p1', safe: true, description: 'no type' },
    { id: 'p2', type: 'frontmatter_cleanup', safe: true },
  ];

  const wrapper = mockWrapper(proposals);
  const mgr = new NotificationManager();

  const result = await runAutoProposals({
    wrapper,
    notificationManager: mgr,
    allowedTypes: ['frontmatter_cleanup'],
  });

  assert.equal(result.fetched, 2);
  assert.equal(result.eligible, 1);
  assert.equal(result.applied, 1);
});
