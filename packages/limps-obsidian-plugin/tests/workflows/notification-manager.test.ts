import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationManager } from '../../src/workflows/notification-manager.js';

test('NotificationManager: notify adds entry to log', () => {
  const mgr = new NotificationManager();

  mgr.notify('info', 'test message');

  const log = mgr.getLog();
  assert.equal(log.length, 1);
  assert.equal(log[0].severity, 'info');
  assert.equal(log[0].message, 'test message');
  assert.ok(log[0].timestamp.length > 0);
});

test('NotificationManager: log preserves order across severities', () => {
  const mgr = new NotificationManager();

  mgr.notify('info', 'first');
  mgr.notify('warning', 'second');
  mgr.notify('error', 'third');
  mgr.notify('success', 'fourth');

  const log = mgr.getLog();
  assert.equal(log.length, 4);
  assert.equal(log[0].severity, 'info');
  assert.equal(log[1].severity, 'warning');
  assert.equal(log[2].severity, 'error');
  assert.equal(log[3].severity, 'success');
});

test('NotificationManager: clearLog empties the log', () => {
  const mgr = new NotificationManager();

  mgr.notify('info', 'message');
  assert.equal(mgr.getLog().length, 1);

  mgr.clearLog();
  assert.equal(mgr.getLog().length, 0);
});

test('NotificationManager: log is bounded by max size', () => {
  const mgr = new NotificationManager();

  for (let i = 0; i < 250; i++) {
    mgr.notify('info', `msg-${i}`);
  }

  // Max is 200 per implementation
  assert.ok(mgr.getLog().length <= 200);
  // Last entry should be the most recent
  const log = mgr.getLog();
  assert.equal(log[log.length - 1].message, 'msg-249');
});
