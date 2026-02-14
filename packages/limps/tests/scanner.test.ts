import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, symlinkSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { PathConfig, ServerConfig } from '../src/config.js';
import { getResolvedPaths, DEFAULT_EXCLUSIONS } from '../src/config.js';
import { streamingScan, type ScanEntry } from '../src/scanner.js';
import { createSchema, indexAllPathsStreaming, type ScanProgress } from '../src/indexer.js';

let tempDir: string;
let db: DatabaseType;

function makeTempDir(): string {
  const dir = join(tmpdir(), `scanner-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function setupDb(): DatabaseType {
  const d = new Database(':memory:');
  createSchema(d);
  return d;
}

async function collectEntries(gen: AsyncGenerator<ScanEntry>): Promise<ScanEntry[]> {
  const entries: ScanEntry[] = [];
  for await (const entry of gen) {
    entries.push(entry);
  }
  return entries;
}

beforeEach(() => {
  tempDir = makeTempDir();
  db = setupDb();
});

afterEach(() => {
  db.close();
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('getResolvedPaths', () => {
  it('synthesizes from plansPath when paths[] is not provided', () => {
    const config: ServerConfig = {
      plansPath: '/foo/plans',
      dataPath: '/foo/data',
      scoring: { weights: {}, biases: {} },
    };
    const resolved = getResolvedPaths(config);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].path).toBe('/foo/plans');
    expect(resolved[0].priority).toBe(100);
    expect(resolved[0].indexMode).toBe('full');
  });

  it('synthesizes from plansPath + docsPaths', () => {
    const config: ServerConfig = {
      plansPath: '/foo/plans',
      docsPaths: ['/foo/docs', '/foo/notes'],
      dataPath: '/foo/data',
      scoring: { weights: {}, biases: {} },
    };
    const resolved = getResolvedPaths(config);
    expect(resolved).toHaveLength(3);
    // Should be sorted by priority descending
    expect(resolved[0].priority).toBe(100);
    expect(resolved[0].path).toBe('/foo/plans');
    expect(resolved[1].priority).toBe(50);
    expect(resolved[2].priority).toBe(50);
  });

  it('deduplicates plansPath appearing in docsPaths', () => {
    const config: ServerConfig = {
      plansPath: '/foo/plans',
      docsPaths: ['/foo/plans', '/foo/docs'],
      dataPath: '/foo/data',
      scoring: { weights: {}, biases: {} },
    };
    const resolved = getResolvedPaths(config);
    expect(resolved).toHaveLength(2);
  });

  it('uses explicit paths[] when provided', () => {
    const config: ServerConfig = {
      plansPath: '/foo/plans',
      dataPath: '/foo/data',
      scoring: { weights: {}, biases: {} },
      paths: [
        { path: '/a', priority: 10 },
        { path: '/b', priority: 90 },
        { path: '/c' }, // default priority 50
      ],
    };
    const resolved = getResolvedPaths(config);
    expect(resolved).toHaveLength(3);
    // Sorted by priority descending
    expect(resolved[0].path).toBe('/b');
    expect(resolved[0].priority).toBe(90);
    expect(resolved[1].path).toBe('/c');
    expect(resolved[1].priority).toBe(50);
    expect(resolved[2].path).toBe('/a');
    expect(resolved[2].priority).toBe(10);
  });
});

describe('streamingScan', () => {
  it('scans a simple directory tree', async () => {
    // Create files
    writeFileSync(join(tempDir, 'readme.md'), '# Hello');
    writeFileSync(join(tempDir, 'notes.md'), '# Notes');

    const paths: PathConfig[] = [{ path: tempDir, priority: 50 }];
    const entries = await collectEntries(streamingScan(paths, DEFAULT_EXCLUSIONS));

    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.path.endsWith('.md'))).toBe(true);
    expect(entries.every((e) => e.indexMode === 'full')).toBe(true);
  });

  it('respects priority ordering', async () => {
    const dirA = join(tempDir, 'a');
    const dirB = join(tempDir, 'b');
    mkdirSync(dirA);
    mkdirSync(dirB);
    writeFileSync(join(dirA, 'a.md'), 'A');
    writeFileSync(join(dirB, 'b.md'), 'B');

    const paths: PathConfig[] = [
      { path: dirA, priority: 10 },
      { path: dirB, priority: 90 },
    ];

    const entries = await collectEntries(streamingScan(paths, DEFAULT_EXCLUSIONS));
    expect(entries).toHaveLength(2);
    // B should come first (higher priority)
    expect(entries[0].path).toContain('b.md');
    expect(entries[1].path).toContain('a.md');
  });

  it('applies global exclusions for directories', async () => {
    const nodeModules = join(tempDir, 'node_modules');
    mkdirSync(nodeModules);
    writeFileSync(join(nodeModules, 'package.md'), 'pkg');
    writeFileSync(join(tempDir, 'readme.md'), '# Hello');

    const paths: PathConfig[] = [{ path: tempDir }];
    const entries = await collectEntries(streamingScan(paths, DEFAULT_EXCLUSIONS));

    expect(entries).toHaveLength(1);
    expect(entries[0].path).toContain('readme.md');
  });

  it('applies per-path exclusions for directories', async () => {
    const vendor = join(tempDir, 'custom_exclude');
    mkdirSync(vendor);
    writeFileSync(join(vendor, 'lib.md'), 'lib');
    writeFileSync(join(tempDir, 'readme.md'), '# Hello');

    const paths: PathConfig[] = [
      {
        path: tempDir,
        exclusions: { directories: ['custom_exclude'] },
      },
    ];
    const entries = await collectEntries(
      streamingScan(paths, { directories: [], filePatterns: [], binaryExtensions: [] })
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].path).toContain('readme.md');
  });

  it('applies per-path file extensions override', async () => {
    writeFileSync(join(tempDir, 'readme.md'), '# Hello');
    writeFileSync(join(tempDir, 'script.ts'), 'console.log()');
    writeFileSync(join(tempDir, 'style.css'), 'body {}');

    const paths: PathConfig[] = [{ path: tempDir, fileExtensions: ['.ts', '.css'] }];
    const entries = await collectEntries(
      streamingScan(paths, { directories: [], filePatterns: [], binaryExtensions: [] })
    );

    expect(entries).toHaveLength(2);
    const names = entries.map((e) => e.path);
    expect(names.some((n) => n.endsWith('.ts'))).toBe(true);
    expect(names.some((n) => n.endsWith('.css'))).toBe(true);
  });

  it('respects maxDepth per path', async () => {
    const deep = join(tempDir, 'a', 'b', 'c');
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(tempDir, 'root.md'), 'root');
    writeFileSync(join(tempDir, 'a', 'level1.md'), 'level1');
    writeFileSync(join(tempDir, 'a', 'b', 'level2.md'), 'level2');
    writeFileSync(join(deep, 'level3.md'), 'level3');

    const paths: PathConfig[] = [{ path: tempDir, maxDepth: 1 }];
    const entries = await collectEntries(streamingScan(paths, DEFAULT_EXCLUSIONS));

    // maxDepth 1 = root (depth 0) + one level down (depth 1)
    expect(entries).toHaveLength(2);
  });

  it('deduplicates files across overlapping paths', async () => {
    const sub = join(tempDir, 'sub');
    mkdirSync(sub);
    writeFileSync(join(sub, 'file.md'), 'content');
    writeFileSync(join(tempDir, 'root.md'), 'root');

    // Both tempDir and sub overlap (sub is inside tempDir)
    const paths: PathConfig[] = [
      { path: tempDir, priority: 100 },
      { path: sub, priority: 50 },
    ];
    const entries = await collectEntries(streamingScan(paths, DEFAULT_EXCLUSIONS));

    // sub/file.md should appear only once
    const filePaths = entries.map((e) => e.path);
    const unique = new Set(filePaths);
    expect(filePaths.length).toBe(unique.size);
  });

  it('skips symlinks', async () => {
    writeFileSync(join(tempDir, 'real.md'), 'real');
    try {
      symlinkSync(join(tempDir, 'real.md'), join(tempDir, 'link.md'));
    } catch {
      // Skip test if symlinks not supported
      return;
    }

    const paths: PathConfig[] = [{ path: tempDir }];
    const entries = await collectEntries(streamingScan(paths, DEFAULT_EXCLUSIONS));

    expect(entries).toHaveLength(1);
    expect(entries[0].path).toContain('real.md');
  });

  it('reports progress via callback', async () => {
    writeFileSync(join(tempDir, 'a.md'), 'a');
    writeFileSync(join(tempDir, 'b.md'), 'b');

    const progressUpdates: ScanProgress[] = [];
    const paths: PathConfig[] = [{ path: tempDir }];
    await collectEntries(
      streamingScan(paths, DEFAULT_EXCLUSIONS, ['.md'], 10, 1_048_576, (p) => {
        progressUpdates.push({ ...p });
      })
    );

    expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
    const last = progressUpdates[progressUpdates.length - 1];
    expect(last.indexed).toBe(2);
    expect(last.errors).toBe(0);
  });

  it('sets indexMode from path config', async () => {
    writeFileSync(join(tempDir, 'readme.md'), '# Hello');

    const paths: PathConfig[] = [{ path: tempDir, indexMode: 'presence' }];
    const entries = await collectEntries(streamingScan(paths, DEFAULT_EXCLUSIONS));

    expect(entries).toHaveLength(1);
    expect(entries[0].indexMode).toBe('presence');
  });

  it('skips files exceeding per-path maxFileSize', async () => {
    writeFileSync(join(tempDir, 'small.md'), 'small');
    writeFileSync(join(tempDir, 'big.md'), 'x'.repeat(200));

    const paths: PathConfig[] = [{ path: tempDir, exclusions: { maxFileSize: 100 } }];
    const entries = await collectEntries(streamingScan(paths, DEFAULT_EXCLUSIONS));

    expect(entries).toHaveLength(1);
    expect(entries[0].path).toContain('small.md');
  });

  it('excludes files matching file patterns', async () => {
    writeFileSync(join(tempDir, 'readme.md'), 'hello');
    writeFileSync(join(tempDir, '.DS_Store'), 'junk');

    const paths: PathConfig[] = [{ path: tempDir }];
    const entries = await collectEntries(streamingScan(paths, DEFAULT_EXCLUSIONS, ['.md', '']));

    // .DS_Store should be excluded by default file patterns
    expect(entries.every((e) => !e.path.includes('.DS_Store'))).toBe(true);
  });
});

describe('indexAllPathsStreaming', () => {
  it('indexes files in full mode', async () => {
    writeFileSync(join(tempDir, 'doc.md'), '# Test Document\n\nSome content');

    const pathConfigs: PathConfig[] = [{ path: tempDir, indexMode: 'full' }];
    const result = await indexAllPathsStreaming(db, pathConfigs);

    expect(result.indexed).toBe(1);
    expect(result.errors).toHaveLength(0);

    // Verify in DB
    const row = db
      .prepare('SELECT title FROM documents WHERE path = ?')
      .get(join(tempDir, 'doc.md')) as { title: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.title).toBe('Test Document');
  });

  it('indexes files in presence mode', async () => {
    writeFileSync(join(tempDir, 'data.md'), 'some data');

    const pathConfigs: PathConfig[] = [{ path: tempDir, indexMode: 'presence' }];
    const result = await indexAllPathsStreaming(db, pathConfigs);

    expect(result.indexed).toBe(1);
    expect(result.errors).toHaveLength(0);

    // Verify in presence table
    const row = db
      .prepare('SELECT path, size FROM file_presence WHERE path = ?')
      .get(join(tempDir, 'data.md')) as { path: string; size: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.size).toBeGreaterThan(0);
  });

  it('skips unchanged files on re-index', async () => {
    writeFileSync(join(tempDir, 'doc.md'), '# Stable');

    const pathConfigs: PathConfig[] = [{ path: tempDir }];
    const first = await indexAllPathsStreaming(db, pathConfigs);
    expect(first.indexed).toBe(1);

    const second = await indexAllPathsStreaming(db, pathConfigs);
    expect(second.skipped).toBe(1);
    expect(second.indexed).toBe(0);
  });

  it('reports progress during indexing', async () => {
    writeFileSync(join(tempDir, 'a.md'), '# A');
    writeFileSync(join(tempDir, 'b.md'), '# B');

    const progress: ScanProgress[] = [];
    const pathConfigs: PathConfig[] = [{ path: tempDir }];
    await indexAllPathsStreaming(
      db,
      pathConfigs,
      DEFAULT_EXCLUSIONS,
      ['.md'],
      10,
      1_048_576,
      (p) => {
        progress.push({ ...p });
      }
    );

    expect(progress.length).toBeGreaterThanOrEqual(2);
  });
});
