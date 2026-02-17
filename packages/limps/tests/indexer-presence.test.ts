import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import {
  initializeDatabase,
  createSchema,
  indexPresence,
  getFilePresence,
  searchFilePresence,
} from '../src/indexer.js';

describe('presence-indexing', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-presence-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-presence-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should record file presence without content parsing', () => {
    const filePath = join(testDir, 'test.md');
    writeFileSync(filePath, '# Hello World\nSome content here.', 'utf-8');

    const result = indexPresence(db!, testDir);

    expect(result.recorded).toBe(1);
    expect(result.skipped).toBe(0);

    // Verify presence record exists
    const presence = getFilePresence(db!, filePath);
    expect(presence).toBeDefined();
    expect(presence!.path).toBe(filePath);
    expect(presence!.size).toBeGreaterThan(0);
    expect(presence!.mtime).toBeGreaterThan(0);
    expect(presence!.type).toBe('file');
    expect(presence!.indexedAt).toBeGreaterThan(0);

    // Verify NO content was indexed in the documents table
    const doc = db!.prepare('SELECT * FROM documents WHERE path = ?').get(filePath);
    expect(doc).toBeUndefined();
  });

  it('should skip unchanged files on re-index', () => {
    const filePath = join(testDir, 'stable.txt');
    writeFileSync(filePath, 'stable content', 'utf-8');

    const result1 = indexPresence(db!, testDir);
    expect(result1.recorded).toBe(1);

    // Re-index without changes
    const result2 = indexPresence(db!, testDir);
    expect(result2.recorded).toBe(0);
    expect(result2.skipped).toBe(1);
  });

  it('should exclude directories from exclusions config', () => {
    // Create excluded directory
    const excludedDir = join(testDir, 'node_modules');
    mkdirSync(excludedDir, { recursive: true });
    writeFileSync(join(excludedDir, 'package.json'), '{}', 'utf-8');

    // Create regular file
    const regularFile = join(testDir, 'readme.md');
    writeFileSync(regularFile, '# README', 'utf-8');

    const result = indexPresence(db!, testDir, {
      directories: ['node_modules'],
    });

    expect(result.recorded).toBe(1);
    const presence = getFilePresence(db!, regularFile);
    expect(presence).toBeDefined();

    const excludedPresence = getFilePresence(db!, join(excludedDir, 'package.json'));
    expect(excludedPresence).toBeUndefined();
  });

  it('should exclude files matching file patterns', () => {
    writeFileSync(join(testDir, 'main.py'), 'print("hi")', 'utf-8');
    writeFileSync(join(testDir, 'main.pyc'), 'bytecode', 'utf-8');
    writeFileSync(join(testDir, '.DS_Store'), '', 'utf-8');

    const result = indexPresence(db!, testDir, {
      filePatterns: ['*.pyc', '.DS_Store'],
    });

    expect(result.recorded).toBe(1);
    expect(getFilePresence(db!, join(testDir, 'main.py'))).toBeDefined();
    expect(getFilePresence(db!, join(testDir, 'main.pyc'))).toBeUndefined();
    expect(getFilePresence(db!, join(testDir, '.DS_Store'))).toBeUndefined();
  });

  it('should exclude files exceeding max file size', () => {
    const smallFile = join(testDir, 'small.txt');
    const largeFile = join(testDir, 'large.txt');
    writeFileSync(smallFile, 'small', 'utf-8');
    writeFileSync(largeFile, 'x'.repeat(2000), 'utf-8');

    const result = indexPresence(db!, testDir, {
      maxFileSize: 1000,
    });

    expect(result.recorded).toBe(1);
    expect(getFilePresence(db!, smallFile)).toBeDefined();
    expect(getFilePresence(db!, largeFile)).toBeUndefined();
  });

  it('should exclude binary extensions', () => {
    writeFileSync(join(testDir, 'doc.md'), '# doc', 'utf-8');
    writeFileSync(join(testDir, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(join(testDir, 'archive.zip'), Buffer.from([0x50, 0x4b]));

    const result = indexPresence(db!, testDir, {
      binaryExtensions: ['.png', '.zip'],
    });

    expect(result.recorded).toBe(1);
    expect(getFilePresence(db!, join(testDir, 'doc.md'))).toBeDefined();
    expect(getFilePresence(db!, join(testDir, 'image.png'))).toBeUndefined();
    expect(getFilePresence(db!, join(testDir, 'archive.zip'))).toBeUndefined();
  });

  it('should batch inserts correctly for many files', () => {
    // Create 250 files to test batching (batch size is 100)
    for (let i = 0; i < 250; i++) {
      writeFileSync(join(testDir, `file-${i}.txt`), `content ${i}`, 'utf-8');
    }

    const result = indexPresence(db!, testDir);

    expect(result.recorded).toBe(250);
    expect(result.skipped).toBe(0);

    // Verify all are queryable
    const all = searchFilePresence(db!, `${testDir}%`);
    expect(all.length).toBe(250);
  });

  it('should search file presence by pattern', () => {
    writeFileSync(join(testDir, 'readme.md'), '# README', 'utf-8');
    writeFileSync(join(testDir, 'notes.md'), '# Notes', 'utf-8');
    writeFileSync(join(testDir, 'script.js'), 'console.log()', 'utf-8');

    indexPresence(db!, testDir);

    const mdFiles = searchFilePresence(db!, '%.md');
    expect(mdFiles.length).toBe(2);

    const allFiles = searchFilePresence(db!, `${testDir}%`);
    expect(allFiles.length).toBe(3);
  });

  it('should throw for non-existent directory', () => {
    expect(() => indexPresence(db!, '/nonexistent/path')).toThrow('Directory not found');
  });

  it('should handle nested directories with exclusions', () => {
    mkdirSync(join(testDir, 'src'), { recursive: true });
    mkdirSync(join(testDir, 'src', 'lib'), { recursive: true });
    mkdirSync(join(testDir, '.git'), { recursive: true });
    mkdirSync(join(testDir, 'vendor'), { recursive: true });

    writeFileSync(join(testDir, 'src', 'main.ts'), 'export {}', 'utf-8');
    writeFileSync(join(testDir, 'src', 'lib', 'util.ts'), 'export {}', 'utf-8');
    writeFileSync(join(testDir, '.git', 'config'), '[core]', 'utf-8');
    writeFileSync(join(testDir, 'vendor', 'dep.js'), 'module.exports', 'utf-8');

    const result = indexPresence(db!, testDir, {
      directories: ['.git', 'vendor'],
    });

    expect(result.recorded).toBe(2); // only src/main.ts and src/lib/util.ts
    expect(getFilePresence(db!, join(testDir, 'src', 'main.ts'))).toBeDefined();
    expect(getFilePresence(db!, join(testDir, 'src', 'lib', 'util.ts'))).toBeDefined();
    expect(getFilePresence(db!, join(testDir, '.git', 'config'))).toBeUndefined();
    expect(getFilePresence(db!, join(testDir, 'vendor', 'dep.js'))).toBeUndefined();
  });

  it('should respect maxDepth', () => {
    mkdirSync(join(testDir, 'a', 'b', 'c'), { recursive: true });
    writeFileSync(join(testDir, 'a', 'top.txt'), 'top', 'utf-8');
    writeFileSync(join(testDir, 'a', 'b', 'mid.txt'), 'mid', 'utf-8');
    writeFileSync(join(testDir, 'a', 'b', 'c', 'deep.txt'), 'deep', 'utf-8');

    // maxDepth=1 means only testDir and one level of children
    const result = indexPresence(db!, testDir, undefined, 1);

    expect(result.recorded).toBe(1); // only a/top.txt
    expect(getFilePresence(db!, join(testDir, 'a', 'top.txt'))).toBeDefined();
    expect(getFilePresence(db!, join(testDir, 'a', 'b', 'mid.txt'))).toBeUndefined();
  });
});

describe('presence-paths-excluded-from-watcher', () => {
  it('should separate full and presence paths in getAllDocsPaths context', () => {
    // This tests the logic conceptually - actual watcher integration tested elsewhere
    const presenceOnlyPaths = new Set<string>(['/data/large-vault']);
    const allPaths = ['/plans', '/data/large-vault', '/docs'];

    const fullIndexPaths = allPaths.filter((p) => !presenceOnlyPaths.has(p));
    const presencePaths = allPaths.filter((p) => presenceOnlyPaths.has(p));

    expect(fullIndexPaths).toEqual(['/plans', '/docs']);
    expect(presencePaths).toEqual(['/data/large-vault']);
  });
});
