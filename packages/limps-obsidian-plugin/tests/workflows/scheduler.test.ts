import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowScheduler } from '../../src/workflows/scheduler.js';
import type { HealthCheckResult } from '../../src/workflows/scheduler.js';
import type { LimpsRunOptions } from '../../src/cli/wrapper.js';

function makeRunOptions(): LimpsRunOptions {
  return {
    limpsPath: 'limps',
    configPath: '/tmp/test-config.json',
    cwd: '/tmp',
    timeoutMs: 2000,
    parseJson: true,
  };
}

test('WorkflowScheduler: start and stop lifecycle', () => {
  const results: HealthCheckResult[][] = [];
  const scheduler = new WorkflowScheduler(
    () => makeRunOptions(),
    (r) => results.push(r)
  );

  assert.equal(scheduler.isRunning(), false);

  scheduler.start(60_000);
  assert.equal(scheduler.isRunning(), true);

  scheduler.stop();
  assert.equal(scheduler.isRunning(), false);
});

test('WorkflowScheduler: start replaces previous interval', () => {
  const scheduler = new WorkflowScheduler(
    () => makeRunOptions(),
    () => {}
  );

  scheduler.start(60_000);
  assert.equal(scheduler.isRunning(), true);

  // Starting again should not throw; replaces the old interval
  scheduler.start(120_000);
  assert.equal(scheduler.isRunning(), true);

  scheduler.stop();
  assert.equal(scheduler.isRunning(), false);
});

test('WorkflowScheduler: stop when not running is a no-op', () => {
  const scheduler = new WorkflowScheduler(
    () => makeRunOptions(),
    () => {}
  );

  // Should not throw
  scheduler.stop();
  assert.equal(scheduler.isRunning(), false);
});
