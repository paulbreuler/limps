import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuntimeStatusLabel, computeLinkStats } from '../src/status/runtimeStatus.js';

test('computeLinkStats summarizes resolved and unresolved references', () => {
  const stats = computeLinkStats(
    {
      'plans/a.md': {
        'plans/b.md': 2,
        'plans/c.md': 1,
      },
      'plans/b.md': {
        'plans/c.md': 3,
      },
    },
    {
      'plans/a.md': {
        'missing/x.md': 4,
      },
    }
  );

  assert.deepEqual(stats, {
    sourceFiles: 2,
    destinationFiles: 2,
    resolvedReferences: 6,
    unresolvedReferences: 4,
  });
});

test('computeLinkStats tolerates unknown shapes', () => {
  const stats = computeLinkStats(null, undefined);
  assert.deepEqual(stats, {
    sourceFiles: 0,
    destinationFiles: 0,
    resolvedReferences: 0,
    unresolvedReferences: 0,
  });
});

test('buildRuntimeStatusLabel includes daemon, link, and mcp state', () => {
  const label = buildRuntimeStatusLabel({
    daemonRunning: true,
    links: {
      sourceFiles: 10,
      destinationFiles: 20,
      resolvedReferences: 80,
      unresolvedReferences: 3,
    },
    mcpEnabled: true,
    mcpConnected: false,
  });

  assert.equal(label, 'limps daemon:up links:r80/u3 mcp:down');
});
