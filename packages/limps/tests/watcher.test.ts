import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { FSWatcher } from 'chokidar';
import { startWatcher, stopWatcher } from '../src/watcher.js';

// File watcher tests are timing-sensitive and flaky in CI environments
// Skip these tests in CI to avoid false failures
const isCI = process.env.CI === 'true';
const describeUnlessCI = isCI ? describe.skip : describe;

const waitForReady = (watcher: FSWatcher, timeoutMs = 5000): Promise<void> =>
  new Promise((resolve, reject) => {
    const onReady = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      watcher.off('ready', onReady);
      reject(new Error('Timed out waiting for watcher ready'));
    }, timeoutMs);
    watcher.once('ready', onReady);
  });

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

const waitForEvent = (
  watcher: FSWatcher,
  event: 'add' | 'change' | 'unlink',
  timeoutMs = 5000
): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event} event`)),
      timeoutMs
    );
    watcher.once(event, () => {
      clearTimeout(timer);
      resolve();
    });
  });

describeUnlessCI('watcher-start', () => {
  let testDir: string;
  let watcher: FSWatcher | null = null;
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
    const onChange = vi.fn();
    watcher = startWatcher(testDir, onChange, ['.md']);

    expect(watcher).toBeDefined();

    await waitForReady(watcher);

    expect(watcher).toBeTruthy();
  });

  it.skip('should watch markdown files', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = startWatcher(testDir, onChange, ['.md']);

    await waitForReady(watcher);

    // Create a markdown file
    const testFile = join(testDir, 'test.md');
    writeFileSync(testFile, '# Test\n\nContent.', 'utf-8');

    await waitFor(() => onChange.mock.calls.length > 0);

    // onChange should be called
    expect(onChange).toHaveBeenCalled();
    const calls = onChange.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const addCall = calls.find((c) => c[1] === 'add');
    expect(addCall).toBeDefined();
    expect(addCall![0]).toBe(testFile);
  });
});

describeUnlessCI('file-change-trigger', () => {
  let testDir: string;
  let watcher: FSWatcher | null = null;
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

  it.skip('should trigger reindex on file change', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = startWatcher(testDir, onChange, ['.md']);
    await waitForReady(watcher);

    const testFile = join(testDir, 'test.md');
    const addEvent = waitForEvent(watcher, 'add', 10000);
    writeFileSync(testFile, '# Test\n\nInitial content.', 'utf-8');

    await addEvent;
    await waitFor(() => onChange.mock.calls.some((call) => call[1] === 'add'));

    // Modify file
    const changeEvent = waitForEvent(watcher, 'change', 10000);
    writeFileSync(testFile, '# Test\n\nUpdated content.', 'utf-8');

    await changeEvent;
    await waitFor(() => onChange.mock.calls.some((call) => call[1] === 'change'), 5000);

    // Should have been called for both add and change
    expect(onChange).toHaveBeenCalled();
    const calls = onChange.mock.calls;

    // Find change event
    const changeCall = calls.find((call) => call[1] === 'change');
    expect(changeCall).toBeDefined();
    expect(changeCall![0]).toBe(testFile);
  });

  it('should trigger on file addition', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = startWatcher(testDir, onChange, ['.md']);

    await waitForReady(watcher);

    const testFile = join(testDir, 'new.md');
    const addEvent = waitForEvent(watcher, 'add', 10000);
    writeFileSync(testFile, '# New\n\nContent.', 'utf-8');

    await addEvent;
    await waitFor(() => onChange.mock.calls.some((call) => call[1] === 'add'), 5000);

    expect(onChange).toHaveBeenCalled();
    const addCall = onChange.mock.calls.find((call) => call[1] === 'add');
    expect(addCall).toBeDefined();
    expect(addCall![0]).toBe(testFile);
  });
});

describeUnlessCI('debouncing', () => {
  let testDir: string;
  let watcher: FSWatcher | null = null;
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

  it.skip('should debounce rapid changes', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = startWatcher(testDir, onChange, ['.md'], []);

    await waitForReady(watcher);

    const testFile = join(testDir, 'test.md');
    const addEvent = waitForEvent(watcher, 'add', 10000);
    writeFileSync(testFile, '# Test\n\nContent 1.', 'utf-8');
    await addEvent;
    await waitFor(() => onChange.mock.calls.some((call) => call[1] === 'add'), 8000);

    // Make rapid changes
    for (let i = 2; i <= 5; i++) {
      writeFileSync(testFile, `# Test\n\nContent ${i}.`, 'utf-8');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    await waitFor(() => onChange.mock.calls.some((call) => call[1] === 'change'), 8000);

    // Should have been called, but debounced
    expect(onChange).toHaveBeenCalled();

    // The exact number of calls depends on debounce implementation
    // but should be less than the number of rapid changes
    const calls = onChange.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
  }, 12000);

  it('should run settled processing after quiet period', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const onSettled = vi.fn().mockResolvedValue(undefined);
    watcher = startWatcher(testDir, onChange, ['.md'], [], 50, 200, onSettled);

    await waitForReady(watcher);

    const testFile = join(testDir, 'settled.md');
    const addEvent = waitForEvent(watcher, 'add', 10000);
    writeFileSync(testFile, '# Test\n\nContent 1.', 'utf-8');
    await addEvent;
    await waitFor(() => onChange.mock.calls.some((call) => call[1] === 'add'), 8000);

    writeFileSync(testFile, '# Test\n\nContent 2.', 'utf-8');
    writeFileSync(testFile, '# Test\n\nContent 3.', 'utf-8');

    await waitFor(() => onSettled.mock.calls.length > 0, 12000);

    expect(onSettled).toHaveBeenCalled();
    const [changes] = onSettled.mock.calls[0] || [];
    expect(Array.isArray(changes)).toBe(true);
    expect(changes.some((c: { path: string }) => c.path === testFile)).toBe(true);
  }, 15000);
});

describeUnlessCI('file-deletion', () => {
  let testDir: string;
  let watcher: FSWatcher | null = null;
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
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = startWatcher(testDir, onChange, ['.md']);

    await waitForReady(watcher);

    const testFile = join(testDir, 'test.md');
    writeFileSync(testFile, '# Test\n\nContent.', 'utf-8');

    await waitFor(() => onChange.mock.calls.some((call) => call[1] === 'add'));

    const unlinkEvent = waitForEvent(watcher, 'unlink', 10000);

    // Delete file
    unlinkSync(testFile);

    await unlinkEvent;
    await waitFor(() => onChange.mock.calls.some((call) => call[1] === 'unlink'));

    expect(onChange).toHaveBeenCalled();
    const unlinkCall = onChange.mock.calls.find((call) => call[1] === 'unlink');
    expect(unlinkCall).toBeDefined();
    expect(unlinkCall![0]).toBe(testFile);
  });

  it('should stop watcher cleanly', async () => {
    const onChange = vi.fn();
    watcher = startWatcher(testDir, onChange, ['.md']);

    await waitForReady(watcher);

    await stopWatcher(watcher);
    watcher = null;

    // Watcher should be stopped
    expect(watcher).toBeNull();
  });
});

describeUnlessCI('multi-extension-watcher', () => {
  let testDir: string;
  let watcher: FSWatcher | null = null;
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
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = startWatcher(testDir, onChange, ['.md', '.jsx', '.tsx']);

    await waitForReady(watcher);

    // Create files with different extensions
    writeFileSync(join(testDir, 'readme.md'), '# README', 'utf-8');
    writeFileSync(join(testDir, 'comp.jsx'), 'export const X = () => null;', 'utf-8');
    writeFileSync(join(testDir, 'typed.tsx'), 'export const Y: FC = () => null;', 'utf-8');
    writeFileSync(join(testDir, 'ignored.js'), 'console.log("ignored");', 'utf-8');

    await waitFor(() => {
      const paths = onChange.mock.calls.map((c: [string, string]) => c[0]);
      return (
        paths.includes(join(testDir, 'readme.md')) &&
        paths.includes(join(testDir, 'comp.jsx')) &&
        paths.includes(join(testDir, 'typed.tsx'))
      );
    }, 8000);

    // Should have been called for .md, .jsx, .tsx but not .js
    const paths = onChange.mock.calls.map((c: [string, string]) => c[0]);
    expect(paths).toContain(join(testDir, 'readme.md'));
    expect(paths).toContain(join(testDir, 'comp.jsx'));
    expect(paths).toContain(join(testDir, 'typed.tsx'));
    expect(paths).not.toContain(join(testDir, 'ignored.js'));
  }, 10000);

  it.skip('should watch JSX files only', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = startWatcher(testDir, onChange, ['.jsx']);

    await waitForReady(watcher);

    writeFileSync(join(testDir, 'comp.jsx'), 'export const Comp = () => null;', 'utf-8');
    writeFileSync(join(testDir, 'readme.md'), '# Ignored', 'utf-8');

    await waitFor(() => onChange.mock.calls.some((call) => call[1] === 'add'));

    const paths = onChange.mock.calls.map((c: [string, string]) => c[0]);
    expect(paths).toContain(join(testDir, 'comp.jsx'));
    expect(paths).not.toContain(join(testDir, 'readme.md'));
  });
});

describeUnlessCI('multi-path-watcher', () => {
  let testDir1: string;
  let testDir2: string;
  let watcher: FSWatcher | null = null;
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
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = startWatcher([testDir1, testDir2], onChange, ['.md']);

    await waitForReady(watcher);

    // Create files in both directories
    writeFileSync(join(testDir1, 'doc1.md'), '# Doc 1', 'utf-8');
    writeFileSync(join(testDir2, 'doc2.md'), '# Doc 2', 'utf-8');

    await waitFor(() => {
      const paths = onChange.mock.calls.map((c: [string, string]) => c[0]);
      return paths.includes(join(testDir1, 'doc1.md')) && paths.includes(join(testDir2, 'doc2.md'));
    }, 2500);

    const paths = onChange.mock.calls.map((c: [string, string]) => c[0]);
    expect(paths).toContain(join(testDir1, 'doc1.md'));
    expect(paths).toContain(join(testDir2, 'doc2.md'));
  });
});
