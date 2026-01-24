import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import { readCoordination } from '../src/coordination.js';
import { loadConfig } from '../src/config.js';
import { handleReadDoc } from '../src/tools/read-doc.js';
import type { ToolContext } from '../src/types.js';

describe('read-doc', () => {
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

  describe('read-full', () => {
    it('should read full file content', async () => {
      const filePath = join(repoRoot, 'test.md');
      const content = '# Test Document\n\nThis is test content.';
      writeFileSync(filePath, content, 'utf-8');

      const result = await handleReadDoc({ path: 'test.md' }, context);

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.path).toBe('test.md');
      expect(output.content).toBe(content);
      expect(output.metadata.size).toBeGreaterThan(0);
      expect(output.metadata.lines).toBe(3);
      expect(output.metadata.type).toBe('md');
      expect(output.metadata.partial).toBeUndefined();
    });
  });

  describe('read-range', () => {
    it('should read line range', async () => {
      const filePath = join(repoRoot, 'test.md');
      const lines = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'];
      writeFileSync(filePath, lines.join('\n'), 'utf-8');

      const result = await handleReadDoc({ path: 'test.md', lines: [2, 4] }, context);

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.content).toBe('Line 2\nLine 3\nLine 4');
      expect(output.metadata.partial).toBe(true);
      expect(output.metadata.range).toEqual([2, 4]);
      expect(output.metadata.lines).toBe(5); // Total lines
    });

    it('should handle range at end of file', async () => {
      const filePath = join(repoRoot, 'test.md');
      const lines = ['Line 1', 'Line 2', 'Line 3'];
      writeFileSync(filePath, lines.join('\n'), 'utf-8');

      const result = await handleReadDoc({ path: 'test.md', lines: [2, 10] }, context);

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.content).toBe('Line 2\nLine 3');
      expect(output.metadata.range).toEqual([2, 3]);
    });

    it('should reject invalid range (start > end)', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, 'content', 'utf-8');

      const result = await handleReadDoc({ path: 'test.md', lines: [5, 2] }, context);

      expect(result.isError).toBe(true);
      const resultText = result.content[0].text;
      expect(resultText).toContain('Invalid line range');
    });

    it('should reject range with zero or negative line numbers', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, 'content', 'utf-8');

      const result = await handleReadDoc({ path: 'test.md', lines: [0, 1] }, context);

      expect(result.isError).toBe(true);
      const resultText = result.content[0].text;
      expect(resultText).toContain('line numbers must be >= 1');
    });
  });

  describe('read-notfound', () => {
    it('should return error for non-existent file', async () => {
      const result = await handleReadDoc({ path: 'nonexistent.md' }, context);

      expect(result.isError).toBe(true);
      const resultText = result.content[0].text;
      expect(resultText).toContain('File not found');
      expect(resultText).toContain('nonexistent.md');
    });
  });

  describe('read-metadata', () => {
    it('should return correct metadata', async () => {
      const filePath = join(repoRoot, 'test.jsx');
      const content = 'import React from "react";\n\nexport default function Test() {}';
      writeFileSync(filePath, content, 'utf-8');

      const result = await handleReadDoc({ path: 'test.jsx' }, context);

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.metadata.type).toBe('jsx');
      expect(output.metadata.size).toBe(content.length);
      expect(output.metadata.lines).toBe(3);
      expect(output.metadata.modified).toBeDefined();
      expect(new Date(output.metadata.modified).getTime()).toBeGreaterThan(0);
    });

    it('should handle empty file', async () => {
      const filePath = join(repoRoot, 'empty.md');
      writeFileSync(filePath, '', 'utf-8');

      const result = await handleReadDoc({ path: 'empty.md' }, context);

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.content).toBe('');
      expect(output.metadata.lines).toBe(0);
      expect(output.metadata.size).toBe(0);
    });

    it('should infer type from extension', async () => {
      const testCases = [
        { file: 'test.md', type: 'md' },
        { file: 'test.jsx', type: 'jsx' },
        { file: 'test.tsx', type: 'tsx' },
        { file: 'test.ts', type: 'ts' },
        { file: 'test.json', type: 'json' },
        { file: 'test.yaml', type: 'yaml' },
        { file: 'test.txt', type: 'other' },
      ];

      for (const testCase of testCases) {
        const filePath = join(repoRoot, testCase.file);
        writeFileSync(filePath, 'content', 'utf-8');

        const result = await handleReadDoc({ path: testCase.file }, context);
        expect(result.isError).toBeFalsy();
        const resultText = result.content[0].text;
        const output = JSON.parse(resultText);
        expect(output.metadata.type).toBe(testCase.type);
      }
    });
  });
});
