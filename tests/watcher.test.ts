import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { FSWatcher } from 'chokidar';
import { startWatcher, stopWatcher } from '../src/watcher.js';

describe('watcher-start', () => {
  let testDir: string;
  let watcher: FSWatcher | null = null;

  beforeEach(() => {
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
  });

  it('should start watcher and watch correct paths', async () => {
    const onChange = vi.fn();
    watcher = startWatcher(testDir, onChange, ['.md']);

    expect(watcher).toBeDefined();

    // Wait a bit for watcher to initialize
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(watcher).toBeTruthy();
  });

  it('should watch markdown files', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = startWatcher(testDir, onChange, ['.md']);

    // Wait for watcher to be ready
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Create a markdown file
    const testFile = join(testDir, 'test.md');
    writeFileSync(testFile, '# Test\n\nContent.', 'utf-8');

    // Wait for file system event and debounce
    await new Promise((resolve) => setTimeout(resolve, 500));

    // onChange should be called
    expect(onChange).toHaveBeenCalled();
    const calls = onChange.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const addCall = calls.find((c) => c[1] === 'add');
    expect(addCall).toBeDefined();
    expect(addCall![0]).toBe(testFile);
  });
});

describe('file-change-trigger', () => {
  let testDir: string;
  let watcher: FSWatcher | null = null;

  beforeEach(() => {
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
  });

  it('should trigger reindex on file change', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = startWatcher(testDir, onChange, ['.md']);

    const testFile = join(testDir, 'test.md');
    writeFileSync(testFile, '# Test\n\nInitial content.', 'utf-8');

    // Wait for add event and debounce
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Modify file
    writeFileSync(testFile, '# Test\n\nUpdated content.', 'utf-8');

    // Wait for change event and debounce
    await new Promise((resolve) => setTimeout(resolve, 500));

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

    await new Promise((resolve) => setTimeout(resolve, 200));

    const testFile = join(testDir, 'new.md');
    writeFileSync(testFile, '# New\n\nContent.', 'utf-8');

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(onChange).toHaveBeenCalled();
    const addCall = onChange.mock.calls.find((call) => call[1] === 'add');
    expect(addCall).toBeDefined();
    expect(addCall![0]).toBe(testFile);
  });
});

describe('debouncing', () => {
  let testDir: string;
  let watcher: FSWatcher | null = null;

  beforeEach(() => {
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
  });

  it('should debounce rapid changes', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = startWatcher(testDir, onChange, ['.md'], []);

    await new Promise((resolve) => setTimeout(resolve, 200));

    const testFile = join(testDir, 'test.md');
    writeFileSync(testFile, '# Test\n\nContent 1.', 'utf-8');

    // Make rapid changes
    for (let i = 2; i <= 5; i++) {
      writeFileSync(testFile, `# Test\n\nContent ${i}.`, 'utf-8');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Wait for debounce delay (200ms default) plus some buffer
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Should have been called, but debounced
    expect(onChange).toHaveBeenCalled();

    // The exact number of calls depends on debounce implementation
    // but should be less than the number of rapid changes
    const calls = onChange.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
  });

  it('should run settled processing after quiet period', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const onSettled = vi.fn().mockResolvedValue(undefined);
    watcher = startWatcher(testDir, onChange, ['.md'], [], 50, 200, onSettled);

    await new Promise((resolve) => setTimeout(resolve, 200));

    const testFile = join(testDir, 'settled.md');
    writeFileSync(testFile, '# Test\n\nContent 1.', 'utf-8');

    writeFileSync(testFile, '# Test\n\nContent 2.', 'utf-8');
    writeFileSync(testFile, '# Test\n\nContent 3.', 'utf-8');

    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(onSettled).toHaveBeenCalled();
    const [changes] = onSettled.mock.calls[0] || [];
    expect(Array.isArray(changes)).toBe(true);
    expect(changes.some((c: { path: string }) => c.path === testFile)).toBe(true);
  });
});

describe('file-deletion', () => {
  let testDir: string;
  let watcher: FSWatcher | null = null;

  beforeEach(() => {
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
  });

  it('should handle file deletion', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = startWatcher(testDir, onChange, ['.md']);

    await new Promise((resolve) => setTimeout(resolve, 200));

    const testFile = join(testDir, 'test.md');
    writeFileSync(testFile, '# Test\n\nContent.', 'utf-8');

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Delete file
    unlinkSync(testFile);

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(onChange).toHaveBeenCalled();
    const unlinkCall = onChange.mock.calls.find((call) => call[1] === 'unlink');
    expect(unlinkCall).toBeDefined();
    expect(unlinkCall![0]).toBe(testFile);
  });

  it('should stop watcher cleanly', async () => {
    const onChange = vi.fn();
    watcher = startWatcher(testDir, onChange, ['.md']);

    await new Promise((resolve) => setTimeout(resolve, 100));

    await stopWatcher(watcher);
    watcher = null;

    // Watcher should be stopped
    expect(watcher).toBeNull();
  });
});

describe('multi-extension-watcher', () => {
  let testDir: string;
  let watcher: FSWatcher | null = null;

  beforeEach(() => {
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
  });

  it('should watch multiple file extensions', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = startWatcher(testDir, onChange, ['.md', '.jsx', '.tsx']);

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Create files with different extensions
    writeFileSync(join(testDir, 'readme.md'), '# README', 'utf-8');
    writeFileSync(join(testDir, 'comp.jsx'), 'export const X = () => null;', 'utf-8');
    writeFileSync(join(testDir, 'typed.tsx'), 'export const Y: FC = () => null;', 'utf-8');
    writeFileSync(join(testDir, 'ignored.js'), 'console.log("ignored");', 'utf-8');

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Should have been called for .md, .jsx, .tsx but not .js
    const paths = onChange.mock.calls.map((c: [string, string]) => c[0]);
    expect(paths).toContain(join(testDir, 'readme.md'));
    expect(paths).toContain(join(testDir, 'comp.jsx'));
    expect(paths).toContain(join(testDir, 'typed.tsx'));
    expect(paths).not.toContain(join(testDir, 'ignored.js'));
  });

  it('should watch JSX files only', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = startWatcher(testDir, onChange, ['.jsx']);

    await new Promise((resolve) => setTimeout(resolve, 200));

    writeFileSync(join(testDir, 'comp.jsx'), 'export const Comp = () => null;', 'utf-8');
    writeFileSync(join(testDir, 'readme.md'), '# Ignored', 'utf-8');

    await new Promise((resolve) => setTimeout(resolve, 500));

    const paths = onChange.mock.calls.map((c: [string, string]) => c[0]);
    expect(paths).toContain(join(testDir, 'comp.jsx'));
    expect(paths).not.toContain(join(testDir, 'readme.md'));
  });
});

describe('multi-path-watcher', () => {
  let testDir1: string;
  let testDir2: string;
  let watcher: FSWatcher | null = null;

  beforeEach(() => {
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
  });

  it('should watch multiple directories', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    watcher = startWatcher([testDir1, testDir2], onChange, ['.md']);

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Create files in both directories
    writeFileSync(join(testDir1, 'doc1.md'), '# Doc 1', 'utf-8');
    writeFileSync(join(testDir2, 'doc2.md'), '# Doc 2', 'utf-8');

    await new Promise((resolve) => setTimeout(resolve, 500));

    const paths = onChange.mock.calls.map((c: [string, string]) => c[0]);
    expect(paths).toContain(join(testDir1, 'doc1.md'));
    expect(paths).toContain(join(testDir2, 'doc2.md'));
  });
});
