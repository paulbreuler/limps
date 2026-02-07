import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, writeFileSync, unlinkSync, mkdirSync, rmSync, symlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { startWatcher, stopWatcher, type LimpsWatcher } from '../src/watcher.js';
import type {
  WatcherBackend,
  WatcherBackendOptions,
  WatcherSubscription,
  RawWatchEvent,
} from '../src/watcher-backend.js';

// File watcher tests are timing-sensitive and flaky in CI environments
// Skip these tests in CI to avoid false failures
const isCI = process.env.CI === 'true';
const describeUnlessCI = isCI ? describe.skip : describe;

/**
 * Wait for a condition to become true, polling at `intervalMs`.
 */
const waitFor = async (
  condition: () => boolean,
  timeoutMs = 5000,
  intervalMs = 50
): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timed out waiting for condition');
};

/**
 * A mock WatcherBackend for deterministic testing.
 * Exposes helpers to simulate events and errors.
 */
class MockWatcherBackend implements WatcherBackend {
  private nextId = 0;
  private callbacks = new Map<string, (events: RawWatchEvent[]) => void>();
  subscribed: string[] = [];
  scanned: string[] = [];
  unsubscribed: string[] = [];

  async subscribe(
    dir: string,
    callback: (events: RawWatchEvent[]) => void,
    _options: WatcherBackendOptions
  ): Promise<WatcherSubscription> {
    const id = String(this.nextId++);
    this.callbacks.set(id, callback);
    this.subscribed.push(dir);
    return { id };
  }

  async initialScan(
    dir: string,
    callback: (events: RawWatchEvent[]) => void,
    _options: WatcherBackendOptions
  ): Promise<void> {
    this.scanned.push(dir);
    // Emit synthetic create events for any .md files that exist in the dir
    const fs = await import('fs');
    const path = await import('path');
    try {
      const entries = fs.readdirSync(dir);
      const events: RawWatchEvent[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            events.push({ type: 'create', path: fullPath });
          }
        } catch {
          // skip
        }
      }
      if (events.length > 0) {
        callback(events);
      }
    } catch {
      // dir doesn't exist yet — fine
    }
  }

  async unsubscribe(subscription: WatcherSubscription): Promise<void> {
    this.unsubscribed.push(subscription.id);
    this.callbacks.delete(subscription.id);
  }

  /** Simulate events arriving from the filesystem watcher. */
  emit(events: RawWatchEvent[]): void {
    for (const cb of this.callbacks.values()) {
      cb(events);
    }
  }
}

describeUnlessCI('watcher-start', () => {
  let testDir: string;
  let watcher: LimpsWatcher | null = null;
  let prevVitestEnv: string | undefined;

  beforeEach(() => {
    prevVitestEnv = process.env.VITEST;
    process.env.VITEST = 'true';
    testDir = join(tmpdir(), `test-watch-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (watcher) {
      await stopWatcher(watcher);
      watcher = null;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    process.env.VITEST = prevVitestEnv;
  });

  it('should start watcher and watch correct paths', async () => {
    const backend = new MockWatcherBackend();
    const onChange = vi.fn();
    watcher = await startWatcher(
      testDir,
      onChange,
      ['.md'],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      backend
    );

    expect(watcher).toBeDefined();
    expect(backend.subscribed).toContain(testDir);
    expect(backend.scanned).toContain(testDir);
  });

  it('should watch markdown files via initial scan', async () => {
    // Create a markdown file before starting watcher
    const testFile = join(testDir, 'test.md');
    writeFileSync(testFile, '# Test\n\nContent.', 'utf-8');

    const backend = new MockWatcherBackend();
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = await startWatcher(
      testDir,
      onChange,
      ['.md'],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      backend
    );

    // The initial scan should have found the file and triggered onChange via debounce
    await waitFor(() => onChange.mock.calls.length > 0);

    expect(onChange).toHaveBeenCalled();
    const addCall = onChange.mock.calls.find((c: [string, string]) => c[1] === 'add');
    expect(addCall).toBeDefined();
    expect(addCall![0]).toBe(testFile);
  });
});

describeUnlessCI('file-change-trigger', () => {
  let testDir: string;
  let watcher: LimpsWatcher | null = null;
  let prevVitestEnv: string | undefined;

  beforeEach(() => {
    prevVitestEnv = process.env.VITEST;
    process.env.VITEST = 'true';
    testDir = join(tmpdir(), `test-watch-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (watcher) {
      await stopWatcher(watcher);
      watcher = null;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    process.env.VITEST = prevVitestEnv;
  });

  it('should trigger reindex on file change', async () => {
    const backend = new MockWatcherBackend();
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = await startWatcher(
      testDir,
      onChange,
      ['.md'],
      [],
      50,
      undefined,
      undefined,
      undefined,
      backend
    );

    const testFile = join(testDir, 'test.md');

    // Simulate file creation
    backend.emit([{ type: 'create', path: testFile }]);
    await waitFor(() => onChange.mock.calls.some((call: [string, string]) => call[1] === 'add'));

    // Simulate file change
    backend.emit([{ type: 'update', path: testFile }]);
    await waitFor(
      () => onChange.mock.calls.some((call: [string, string]) => call[1] === 'change'),
      5000
    );

    expect(onChange).toHaveBeenCalled();
    const changeCall = onChange.mock.calls.find((call: [string, string]) => call[1] === 'change');
    expect(changeCall).toBeDefined();
    expect(changeCall![0]).toBe(testFile);
  });

  it('should trigger on file addition', async () => {
    const backend = new MockWatcherBackend();
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = await startWatcher(
      testDir,
      onChange,
      ['.md'],
      [],
      50,
      undefined,
      undefined,
      undefined,
      backend
    );

    const testFile = join(testDir, 'new.md');

    // Simulate file creation
    backend.emit([{ type: 'create', path: testFile }]);
    await waitFor(
      () => onChange.mock.calls.some((call: [string, string]) => call[1] === 'add'),
      5000
    );

    expect(onChange).toHaveBeenCalled();
    const addCall = onChange.mock.calls.find((call: [string, string]) => call[1] === 'add');
    expect(addCall).toBeDefined();
    expect(addCall![0]).toBe(testFile);
  });
});

describeUnlessCI('debouncing', () => {
  let testDir: string;
  let watcher: LimpsWatcher | null = null;
  let prevVitestEnv: string | undefined;

  beforeEach(() => {
    prevVitestEnv = process.env.VITEST;
    process.env.VITEST = 'true';
    testDir = join(tmpdir(), `test-watch-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (watcher) {
      await stopWatcher(watcher);
      watcher = null;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    process.env.VITEST = prevVitestEnv;
  });

  it('should debounce rapid changes', async () => {
    const backend = new MockWatcherBackend();
    const onChange = vi.fn().mockResolvedValue(undefined);
    // 200ms debounce
    watcher = await startWatcher(
      testDir,
      onChange,
      ['.md'],
      [],
      200,
      undefined,
      undefined,
      undefined,
      backend
    );

    const testFile = join(testDir, 'test.md');

    // Simulate initial add
    backend.emit([{ type: 'create', path: testFile }]);
    await waitFor(() => onChange.mock.calls.some((call: [string, string]) => call[1] === 'add'));

    // Make rapid changes (should be debounced)
    for (let i = 0; i < 5; i++) {
      backend.emit([{ type: 'update', path: testFile }]);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    await waitFor(
      () => onChange.mock.calls.some((call: [string, string]) => call[1] === 'change'),
      5000
    );

    // Should have been called, but debounced — fewer change calls than emits
    expect(onChange).toHaveBeenCalled();
    const changeCalls = onChange.mock.calls.filter((c: [string, string]) => c[1] === 'change');
    expect(changeCalls.length).toBeLessThan(5);
  });

  it('should run settled processing after quiet period', async () => {
    const backend = new MockWatcherBackend();
    const onChange = vi.fn().mockResolvedValue(undefined);
    const onSettled = vi.fn().mockResolvedValue(undefined);
    watcher = await startWatcher(
      testDir,
      onChange,
      ['.md'],
      [],
      50,
      200,
      onSettled,
      undefined,
      backend
    );

    const testFile = join(testDir, 'settled.md');

    // Simulate file events
    backend.emit([{ type: 'create', path: testFile }]);
    await waitFor(() => onChange.mock.calls.some((call: [string, string]) => call[1] === 'add'));

    backend.emit([{ type: 'update', path: testFile }]);
    backend.emit([{ type: 'update', path: testFile }]);

    await waitFor(() => onSettled.mock.calls.length > 0, 5000);

    expect(onSettled).toHaveBeenCalled();
    const [changes] = onSettled.mock.calls[0] || [];
    expect(Array.isArray(changes)).toBe(true);
    expect(changes.some((c: { path: string }) => c.path === testFile)).toBe(true);
  });
});

describeUnlessCI('file-deletion', () => {
  let testDir: string;
  let watcher: LimpsWatcher | null = null;
  let prevVitestEnv: string | undefined;

  beforeEach(() => {
    prevVitestEnv = process.env.VITEST;
    process.env.VITEST = 'true';
    testDir = join(tmpdir(), `test-watch-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (watcher) {
      await stopWatcher(watcher);
      watcher = null;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    process.env.VITEST = prevVitestEnv;
  });

  it('should handle file deletion', async () => {
    const backend = new MockWatcherBackend();
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = await startWatcher(
      testDir,
      onChange,
      ['.md'],
      [],
      50,
      undefined,
      undefined,
      undefined,
      backend
    );

    const testFile = join(testDir, 'test.md');

    // Simulate add then delete
    backend.emit([{ type: 'create', path: testFile }]);
    await waitFor(() => onChange.mock.calls.some((call: [string, string]) => call[1] === 'add'));

    backend.emit([{ type: 'delete', path: testFile }]);
    await waitFor(() => onChange.mock.calls.some((call: [string, string]) => call[1] === 'unlink'));

    const unlinkCall = onChange.mock.calls.find((call: [string, string]) => call[1] === 'unlink');
    expect(unlinkCall).toBeDefined();
    expect(unlinkCall![0]).toBe(testFile);
  });

  it('should stop watcher cleanly', async () => {
    const backend = new MockWatcherBackend();
    const onChange = vi.fn();
    watcher = await startWatcher(
      testDir,
      onChange,
      ['.md'],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      backend
    );

    await stopWatcher(watcher);
    watcher = null;

    expect(backend.unsubscribed.length).toBeGreaterThan(0);
  });
});

describeUnlessCI('multi-extension-watcher', () => {
  let testDir: string;
  let watcher: LimpsWatcher | null = null;
  let prevVitestEnv: string | undefined;

  beforeEach(() => {
    prevVitestEnv = process.env.VITEST;
    process.env.VITEST = 'true';
    testDir = join(tmpdir(), `test-watch-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (watcher) {
      await stopWatcher(watcher);
      watcher = null;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    process.env.VITEST = prevVitestEnv;
  });

  it('should watch multiple file extensions', async () => {
    const backend = new MockWatcherBackend();
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = await startWatcher(
      testDir,
      onChange,
      ['.md', '.jsx', '.tsx'],
      [],
      50,
      undefined,
      undefined,
      undefined,
      backend
    );

    // Simulate file creation events with different extensions
    backend.emit([
      { type: 'create', path: join(testDir, 'readme.md') },
      { type: 'create', path: join(testDir, 'comp.jsx') },
      { type: 'create', path: join(testDir, 'typed.tsx') },
      { type: 'create', path: join(testDir, 'ignored.js') },
    ]);

    await waitFor(() => {
      const paths = onChange.mock.calls.map((c: [string, string]) => c[0]);
      return (
        paths.includes(join(testDir, 'readme.md')) &&
        paths.includes(join(testDir, 'comp.jsx')) &&
        paths.includes(join(testDir, 'typed.tsx'))
      );
    }, 5000);

    const paths = onChange.mock.calls.map((c: [string, string]) => c[0]);
    expect(paths).toContain(join(testDir, 'readme.md'));
    expect(paths).toContain(join(testDir, 'comp.jsx'));
    expect(paths).toContain(join(testDir, 'typed.tsx'));
    expect(paths).not.toContain(join(testDir, 'ignored.js'));
  });

  it('should watch JSX files only', async () => {
    const backend = new MockWatcherBackend();
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = await startWatcher(
      testDir,
      onChange,
      ['.jsx'],
      [],
      50,
      undefined,
      undefined,
      undefined,
      backend
    );

    backend.emit([
      { type: 'create', path: join(testDir, 'comp.jsx') },
      { type: 'create', path: join(testDir, 'readme.md') },
    ]);

    await waitFor(() => onChange.mock.calls.some((call: [string, string]) => call[1] === 'add'));

    const paths = onChange.mock.calls.map((c: [string, string]) => c[0]);
    expect(paths).toContain(join(testDir, 'comp.jsx'));
    expect(paths).not.toContain(join(testDir, 'readme.md'));
  });
});

describeUnlessCI('multi-path-watcher', () => {
  let testDir1: string;
  let testDir2: string;
  let watcher: LimpsWatcher | null = null;
  let prevVitestEnv: string | undefined;

  beforeEach(() => {
    prevVitestEnv = process.env.VITEST;
    process.env.VITEST = 'true';
    testDir1 = join(tmpdir(), `test-watch1-${Date.now()}`);
    testDir2 = join(tmpdir(), `test-watch2-${Date.now()}`);
    mkdirSync(testDir1, { recursive: true });
    mkdirSync(testDir2, { recursive: true });
  });

  afterEach(async () => {
    if (watcher) {
      await stopWatcher(watcher);
      watcher = null;
    }
    if (existsSync(testDir1)) {
      rmSync(testDir1, { recursive: true, force: true });
    }
    if (existsSync(testDir2)) {
      rmSync(testDir2, { recursive: true, force: true });
    }
    process.env.VITEST = prevVitestEnv;
  });

  it('should watch multiple directories', async () => {
    const backend = new MockWatcherBackend();
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = await startWatcher(
      [testDir1, testDir2],
      onChange,
      ['.md'],
      [],
      50,
      undefined,
      undefined,
      undefined,
      backend
    );

    expect(backend.subscribed).toContain(testDir1);
    expect(backend.subscribed).toContain(testDir2);

    // Simulate file events from both directories
    backend.emit([
      { type: 'create', path: join(testDir1, 'doc1.md') },
      { type: 'create', path: join(testDir2, 'doc2.md') },
    ]);

    await waitFor(() => {
      const paths = onChange.mock.calls.map((c: [string, string]) => c[0]);
      return paths.includes(join(testDir1, 'doc1.md')) && paths.includes(join(testDir2, 'doc2.md'));
    }, 5000);

    const paths = onChange.mock.calls.map((c: [string, string]) => c[0]);
    expect(paths).toContain(join(testDir1, 'doc1.md'));
    expect(paths).toContain(join(testDir2, 'doc2.md'));
  });
});

describeUnlessCI('emfile-handling', () => {
  let testDir: string;
  let watcher: LimpsWatcher | null = null;
  let prevVitestEnv: string | undefined;

  beforeEach(() => {
    prevVitestEnv = process.env.VITEST;
    process.env.VITEST = 'true';
    testDir = join(tmpdir(), `test-watch-emfile-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (watcher) {
      await stopWatcher(watcher);
      watcher = null;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    process.env.VITEST = prevVitestEnv;
  });

  it('should propagate EMFILE error from backend subscribe', async () => {
    // Create a backend that simulates EMFILE during subscribe
    const errorBackend: WatcherBackend = {
      async subscribe(
        _dir: string,
        _callback: (events: RawWatchEvent[]) => void,
        _options: WatcherBackendOptions
      ): Promise<WatcherSubscription> {
        // Simulate EMFILE error during subscribe
        const error = new Error('Too many open files') as NodeJS.ErrnoException;
        error.code = 'EMFILE';
        throw error;
      },
      async initialScan(): Promise<void> {},
      async unsubscribe(): Promise<void> {},
    };

    const onChange = vi.fn().mockResolvedValue(undefined);

    // startWatcher should propagate EMFILE errors from subscribe
    // (logging happens in the callback for runtime errors, not startup errors)
    await expect(
      startWatcher(
        testDir,
        onChange,
        ['.md'],
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        errorBackend
      )
    ).rejects.toThrow('Too many open files');
  });
});

describeUnlessCI('timer-cleanup', () => {
  let testDir: string;
  let watcher: LimpsWatcher | null = null;
  let prevVitestEnv: string | undefined;

  beforeEach(() => {
    prevVitestEnv = process.env.VITEST;
    process.env.VITEST = 'true';
    testDir = join(tmpdir(), `test-watch-timer-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (watcher) {
      await stopWatcher(watcher);
      watcher = null;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    process.env.VITEST = prevVitestEnv;
  });

  it('should not fire callbacks after stopWatcher', async () => {
    const backend = new MockWatcherBackend();
    const onChange = vi.fn().mockResolvedValue(undefined);
    const onSettled = vi.fn().mockResolvedValue(undefined);

    // Use long debounce/settle so timers are still pending when we stop
    watcher = await startWatcher(
      testDir,
      onChange,
      ['.md'],
      [],
      2000,
      5000,
      onSettled,
      undefined,
      backend
    );

    // Simulate a file event to create pending timers
    backend.emit([{ type: 'create', path: join(testDir, 'pending.md') }]);

    // Give a moment for the event to queue the debounce
    await new Promise((r) => setTimeout(r, 100));

    // Stop the watcher (should clear all pending timers)
    await stopWatcher(watcher);
    watcher = null;

    // Record call counts immediately after stop
    const onChangeCountAtStop = onChange.mock.calls.length;
    const onSettledCountAtStop = onSettled.mock.calls.length;

    // Wait longer than the debounce/settle delays
    await new Promise((r) => setTimeout(r, 3000));

    // No new callbacks should have fired after stop
    expect(onChange.mock.calls.length).toBe(onChangeCountAtStop);
    expect(onSettled.mock.calls.length).toBe(onSettledCountAtStop);
  }, 10000);
});

describeUnlessCI('watcher-security', () => {
  let testDir: string;
  let watcher: LimpsWatcher | null = null;
  let prevVitestEnv: string | undefined;

  beforeEach(() => {
    prevVitestEnv = process.env.VITEST;
    process.env.VITEST = 'true';
    testDir = join(tmpdir(), `test-watch-sec-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (watcher) {
      await stopWatcher(watcher);
      watcher = null;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    process.env.VITEST = prevVitestEnv;
  });

  it('should not trigger onChange for symlinked files', async () => {
    const backend = new MockWatcherBackend();
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = await startWatcher(
      testDir,
      onChange,
      ['.md'],
      [],
      50,
      undefined,
      undefined,
      undefined,
      backend
    );

    // Create a real file and simulate its event
    const realFile = join(testDir, 'real.md');
    writeFileSync(realFile, '# Real', 'utf-8');
    backend.emit([{ type: 'create', path: realFile }]);
    await waitFor(() => onChange.mock.calls.length > 0, 5000);

    // Reset
    onChange.mockClear();

    // Create a symlink target and symlink
    const targetFile = join(tmpdir(), `symlink-target-${Date.now()}.md`);
    writeFileSync(targetFile, '# Symlink Target', 'utf-8');
    const linkFile = join(testDir, 'linked.md');
    symlinkSync(targetFile, linkFile);

    // Simulate event for the symlink — should be filtered out by isSymlink check
    backend.emit([{ type: 'create', path: linkFile }]);

    // Wait briefly — symlink should NOT trigger onChange
    await new Promise((r) => setTimeout(r, 300));

    const linkedCalls = onChange.mock.calls.filter(
      (call: [string, string]) => call[0] === linkFile
    );
    expect(linkedCalls).toHaveLength(0);

    // Cleanup
    try {
      unlinkSync(targetFile);
    } catch {
      // ignore
    }
  });

  it('should accept maxDepth parameter and filter deep files', async () => {
    const backend = new MockWatcherBackend();
    const onChange = vi.fn().mockResolvedValue(undefined);
    // maxDepth = 1
    watcher = await startWatcher(
      testDir,
      onChange,
      ['.md'],
      [],
      50,
      undefined,
      undefined,
      1,
      backend
    );

    expect(watcher).toBeDefined();

    // File at depth 1 (within limit)
    const subDir = join(testDir, 'sub');
    mkdirSync(subDir, { recursive: true });
    const shallowFile = join(subDir, 'shallow.md');
    backend.emit([{ type: 'create', path: shallowFile }]);

    // File at depth 2 (exceeds limit)
    const deepDir = join(testDir, 'sub', 'deep');
    mkdirSync(deepDir, { recursive: true });
    const deepFile = join(deepDir, 'deep.md');
    backend.emit([{ type: 'create', path: deepFile }]);

    await waitFor(() => onChange.mock.calls.length > 0, 3000);
    // Give a moment for any additional debounced calls
    await new Promise((r) => setTimeout(r, 200));

    const paths = onChange.mock.calls.map((c: [string, string]) => c[0]);
    expect(paths).toContain(shallowFile);
    expect(paths).not.toContain(deepFile);
  });
});

describe('watcher-backend-interface', () => {
  it('should use injected backend instead of default', async () => {
    const testDir = join(tmpdir(), `test-watch-inject-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    const backend = new MockWatcherBackend();
    const onChange = vi.fn().mockResolvedValue(undefined);

    const watcher = await startWatcher(
      testDir,
      onChange,
      ['.md'],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      backend
    );

    // Backend should have been used
    expect(backend.subscribed).toContain(testDir);
    expect(backend.scanned).toContain(testDir);

    await stopWatcher(watcher);

    // Backend should have been unsubscribed
    expect(backend.unsubscribed.length).toBeGreaterThan(0);

    rmSync(testDir, { recursive: true, force: true });
  });
});
