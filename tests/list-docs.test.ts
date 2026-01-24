import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import { readCoordination } from '../src/coordination.js';
import { loadConfig } from '../src/config.js';
import { handleListDocs } from '../src/tools/list-docs.js';
import type { ToolContext } from '../src/types.js';

describe('list-docs', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let repoRoot: string;
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    repoRoot = testDir;
    coordinationPath = join(testDir, 'coordination.json');

    mkdirSync(repoRoot, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = join(repoRoot, 'plans');
    config.docsPaths = [repoRoot];

    const coordination = await readCoordination(coordinationPath);

    context = {
      db,
      coordination,
      config,
    };
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

  describe('list-root', () => {
    it('should list root directory entries', async () => {
      // Create test files and directories
      writeFileSync(join(repoRoot, 'file1.md'), 'content', 'utf-8');
      writeFileSync(join(repoRoot, 'file2.jsx'), 'content', 'utf-8');
      mkdirSync(join(repoRoot, 'subdir'), { recursive: true });
      writeFileSync(join(repoRoot, 'subdir', 'file3.md'), 'content', 'utf-8');

      const result = await handleListDocs({ path: '' }, context);

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.path).toBe('');
      expect(output.entries.length).toBeGreaterThan(0);
      expect(output.total).toBe(output.entries.length);

      // Check that directories come first
      const dirIndex = output.entries.findIndex((e: any) => e.type === 'directory');
      const fileIndex = output.entries.findIndex((e: any) => e.type === 'file');
      if (dirIndex !== -1 && fileIndex !== -1) {
        expect(dirIndex).toBeLessThan(fileIndex);
      }

      // Verify entries have required fields
      for (const entry of output.entries) {
        expect(entry.name).toBeDefined();
        expect(entry.type).toMatch(/^(file|directory)$/);
        if (entry.type === 'file') {
          expect(entry.size).toBeDefined();
        }
        if (entry.type === 'directory') {
          expect(entry.children).toBeDefined();
        }
      }
    });
  });

  describe('list-pattern', () => {
    it('should filter by glob pattern', async () => {
      writeFileSync(join(repoRoot, 'file1.md'), 'content', 'utf-8');
      writeFileSync(join(repoRoot, 'file2.jsx'), 'content', 'utf-8');
      writeFileSync(join(repoRoot, 'file3.ts'), 'content', 'utf-8');

      const result = await handleListDocs({ path: '', pattern: '*.md' }, context);

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.entries.every((e: any) => e.name.endsWith('.md'))).toBe(true);
    });

    it('should filter by pattern in subdirectory', async () => {
      const subdir = join(repoRoot, 'subdir');
      mkdirSync(subdir, { recursive: true });
      writeFileSync(join(subdir, 'file1.md'), 'content', 'utf-8');
      writeFileSync(join(subdir, 'file2.jsx'), 'content', 'utf-8');

      const result = await handleListDocs({ path: 'subdir', pattern: '*.jsx' }, context);

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.entries.every((e: any) => e.name.endsWith('.jsx'))).toBe(true);
    });
  });

  describe('list-depth', () => {
    it('should respect depth limit', async () => {
      // Create nested structure
      const level1 = join(repoRoot, 'level1');
      const level2 = join(level1, 'level2');
      const level3 = join(level2, 'level3');
      mkdirSync(level3, { recursive: true });
      writeFileSync(join(level1, 'file1.md'), 'content', 'utf-8');
      writeFileSync(join(level2, 'file2.md'), 'content', 'utf-8');
      writeFileSync(join(level3, 'file3.md'), 'content', 'utf-8');

      const result = await handleListDocs({ path: '', depth: 1 }, context);

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);

      // Should include level1 directory
      const level1Entry = output.entries.find((e: any) => e.name === 'level1');
      expect(level1Entry).toBeDefined();
      expect(level1Entry.type).toBe('directory');

      // Should not include level3 files directly (depth limit)
      // But level1 should be listed
    });

    it('should summarize nested contents at max depth', async () => {
      const subdir = join(repoRoot, 'subdir');
      mkdirSync(subdir, { recursive: true });
      writeFileSync(join(subdir, 'file1.md'), 'content', 'utf-8');
      writeFileSync(join(subdir, 'file2.md'), 'content', 'utf-8');

      const result = await handleListDocs({ path: '', depth: 1 }, context);

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      const subdirEntry = output.entries.find((e: any) => e.name === 'subdir');
      expect(subdirEntry).toBeDefined();
      expect(subdirEntry.children).toBe(2);
    });
  });

  describe('list-hidden', () => {
    it('should exclude hidden files by default', async () => {
      writeFileSync(join(repoRoot, 'visible.md'), 'content', 'utf-8');
      writeFileSync(join(repoRoot, '.hidden.md'), 'content', 'utf-8');
      mkdirSync(join(repoRoot, '.hidden-dir'), { recursive: true });

      const result = await handleListDocs({ path: '' }, context);

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.entries.every((e: any) => !e.name.startsWith('.'))).toBe(true);
    });

    it('should include hidden files when includeHidden is true', async () => {
      writeFileSync(join(repoRoot, 'visible.md'), 'content', 'utf-8');
      writeFileSync(join(repoRoot, '.hidden.md'), 'content', 'utf-8');

      const result = await handleListDocs({ path: '', includeHidden: true }, context);

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      const hasHidden = output.entries.some((e: any) => e.name.startsWith('.'));
      expect(hasHidden).toBe(true);
    });
  });

  it('should return error for non-existent directory', async () => {
    const result = await handleListDocs({ path: 'nonexistent' }, context);

    expect(result.isError).toBe(true);
    const resultText = result.content[0].text;
    expect(resultText).toContain('not found');
  });

  it('should return error for file path (not directory)', async () => {
    writeFileSync(join(repoRoot, 'file.md'), 'content', 'utf-8');

    const result = await handleListDocs({ path: 'file.md' }, context);

    expect(result.isError).toBe(true);
    const resultText = result.content[0].text;
    expect(resultText).toContain('not a directory');
  });

  it('should include file sizes and modification times', async () => {
    writeFileSync(join(repoRoot, 'test.md'), 'test content', 'utf-8');

    const result = await handleListDocs({ path: '' }, context);

    expect(result.isError).toBeFalsy();
    const resultText = result.content[0].text;
    const output = JSON.parse(resultText);
    const fileEntry = output.entries.find((e: any) => e.name === 'test.md');
    expect(fileEntry).toBeDefined();
    expect(fileEntry.size).toBeGreaterThan(0);
    expect(fileEntry.modified).toBeDefined();
    expect(new Date(fileEntry.modified).getTime()).toBeGreaterThan(0);
  });
});
