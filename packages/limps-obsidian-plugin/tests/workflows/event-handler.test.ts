import test from 'node:test';
import assert from 'node:assert/strict';
import { VaultEventHandler } from '../../src/workflows/event-handler.js';
import type { Plugin } from 'obsidian';
import type { LimpsRunOptions } from '../../src/cli/wrapper.js';

function makeRunOptions(): LimpsRunOptions {
  return {
    limpsPath: 'limps',
    configPath: '/tmp/test-config.json',
    cwd: '/tmp',
    timeoutMs: 2000,
    parseJson: false,
  };
}

function makeMockPlugin(): Plugin {
  return {
    app: {
      vault: {
        on: () => ({}),
      },
    },
    registerEvent: () => {},
  } as unknown as Plugin;
}

function createHandler(vaultPath: string, plansPath: string): VaultEventHandler {
  return new VaultEventHandler({
    plugin: makeMockPlugin(),
    debounceMs: 750,
    plansPath,
    vaultPath,
    getRunOptions: () => makeRunOptions(),
    onReindex: () => {},
  });
}

test('VaultEventHandler: shouldHandle accepts markdown files in plans directory', () => {
  const handler = createHandler('/vault', '/vault/plans');

  assert.equal(handler.shouldHandle('plans/0001-feature/README.md'), true);
  assert.equal(handler.shouldHandle('plans/0001-feature/agents/000-task.md'), true);
});

test('VaultEventHandler: shouldHandle rejects non-markdown files', () => {
  const handler = createHandler('/vault', '/vault/plans');

  assert.equal(handler.shouldHandle('plans/0001-feature/image.png'), false);
  assert.equal(handler.shouldHandle('plans/0001-feature/data.json'), false);
  assert.equal(handler.shouldHandle('plans/0001-feature/notes.txt'), false);
  assert.equal(handler.shouldHandle('plans/0001-feature/archive.zip'), false);
});

test('VaultEventHandler: shouldHandle rejects files outside plans directory', () => {
  const handler = createHandler('/vault', '/vault/plans');

  assert.equal(handler.shouldHandle('daily-notes/2024-01-01.md'), false);
  assert.equal(handler.shouldHandle('templates/plan-template.md'), false);
  assert.equal(handler.shouldHandle('README.md'), false);
});

test('VaultEventHandler: shouldHandle handles trailing slash in plansPath', () => {
  const handler = createHandler('/vault', '/vault/plans/');

  assert.equal(handler.shouldHandle('plans/0001-feature/README.md'), true);
  assert.equal(handler.shouldHandle('other/file.md'), false);
});

test('VaultEventHandler: register and unregister lifecycle', () => {
  const handler = createHandler('/vault', '/vault/plans');

  // Should not throw
  handler.register();
  handler.unregister();
});

test('VaultEventHandler: unregister when not registered is a no-op', () => {
  const handler = createHandler('/vault', '/vault/plans');

  // Should not throw
  handler.unregister();
});
