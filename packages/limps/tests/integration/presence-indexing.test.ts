import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initializeDatabase,
  createSchema,
  indexDocument,
  indexPresence,
  getFilePresence,
} from '../../src/indexer.js';
import type Database from 'better-sqlite3';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Integration tests for presence-aware indexing.
 * Tests presence-only indexing, full indexing with FTS, and exclusion filtering.
 */
describe('presence-indexing', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-presence-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-presence-dir-${Date.now()}`);
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

  describe('presence-only indexing', () => {
    it('should record path, size, and mtime for files', () => {
      const filePath = join(testDir, 'test.md');
      writeFileSync(filePath, '# Hello\n\nSome content here.', 'utf-8');

      const result = indexPresence(db!, testDir);
      expect(result.recorded).toBeGreaterThanOrEqual(1);

      const presence = getFilePresence(db!, filePath);
      expect(presence).toBeDefined();
      expect(presence!.path).toBe(filePath);
      expect(presence!.size).toBeGreaterThan(0);
      expect(presence!.mtime).toBeGreaterThan(0);
    });

    it('should skip unchanged files on re-index', () => {
      const filePath = join(testDir, 'unchanged.md');
      writeFileSync(filePath, '# Unchanged', 'utf-8');

      const first = indexPresence(db!, testDir);
      expect(first.recorded).toBe(1);

      const second = indexPresence(db!, testDir);
      expect(second.skipped).toBe(1);
      expect(second.recorded).toBe(0);
    });

    it('should not create FTS entries for presence-only files', () => {
      const filePath = join(testDir, 'presence-only.md');
      writeFileSync(filePath, '# Search me\n\nSpecial keywords here.', 'utf-8');

      indexPresence(db!, testDir);

      // FTS should not contain this file (query documents_fts directly)
      const ftsRow = db!
        .prepare('SELECT path FROM documents_fts WHERE documents_fts MATCH ?')
        .all('Special keywords') as { path: string }[];
      const found = ftsRow.some((r) => r.path === filePath);
      expect(found).toBe(false);
    });
  });

  describe('full index mode', () => {
    it('should create FTS entries when using full indexing', async () => {
      const filePath = join(testDir, 'fullindex.md');
      writeFileSync(filePath, '# Full Index Test\n\nUnique searchable content.', 'utf-8');

      await indexDocument(db!, filePath);

      // Query FTS directly to verify full indexing
      const ftsRows = db!
        .prepare('SELECT path FROM documents_fts WHERE documents_fts MATCH ?')
        .all('searchable') as { path: string }[];
      expect(ftsRows.length).toBeGreaterThanOrEqual(1);
      expect(ftsRows.some((r) => r.path === filePath)).toBe(true);
    });
  });

  describe('exclusion filtering', () => {
    it('should exclude node_modules directories', () => {
      const nmDir = join(testDir, 'node_modules');
      mkdirSync(nmDir, { recursive: true });
      writeFileSync(join(nmDir, 'pkg.md'), '# Package', 'utf-8');

      indexPresence(db!, testDir);

      const presence = getFilePresence(db!, join(nmDir, 'pkg.md'));
      expect(presence).toBeUndefined();
    });

    it('should exclude .git directories', () => {
      const gitDir = join(testDir, '.git');
      mkdirSync(gitDir, { recursive: true });
      writeFileSync(join(gitDir, 'config.md'), '# Git config', 'utf-8');

      indexPresence(db!, testDir);

      const presence = getFilePresence(db!, join(gitDir, 'config.md'));
      expect(presence).toBeUndefined();
    });

    it('should exclude binary files by extension', () => {
      writeFileSync(join(testDir, 'image.png'), Buffer.from([0x89, 0x50]));
      writeFileSync(join(testDir, 'doc.md'), '# Document', 'utf-8');

      const exclusions = {
        directories: ['.git', 'node_modules'],
        filePatterns: [],
        binaryExtensions: ['.png', '.jpg', '.gif', '.exe'],
      };

      indexPresence(db!, testDir, exclusions);

      const pngPresence = getFilePresence(db!, join(testDir, 'image.png'));
      expect(pngPresence).toBeUndefined();

      // .md files should still be indexed
      const mdPresence = getFilePresence(db!, join(testDir, 'doc.md'));
      expect(mdPresence).toBeDefined();
    });
  });

  describe('multi-path config', () => {
    it('should index multiple directories independently', () => {
      const dir1 = join(testDir, 'docs');
      const dir2 = join(testDir, 'notes');
      mkdirSync(dir1, { recursive: true });
      mkdirSync(dir2, { recursive: true });

      writeFileSync(join(dir1, 'a.md'), '# Doc A', 'utf-8');
      writeFileSync(join(dir2, 'b.md'), '# Doc B', 'utf-8');

      indexPresence(db!, dir1);
      indexPresence(db!, dir2);

      const presA = getFilePresence(db!, join(dir1, 'a.md'));
      const presB = getFilePresence(db!, join(dir2, 'b.md'));
      expect(presA).toBeDefined();
      expect(presB).toBeDefined();
    });

    it('should throw for non-existent directories', () => {
      expect(() => indexPresence(db!, '/nonexistent/path')).toThrow('Directory not found');
    });
  });
});
