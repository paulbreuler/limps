/**
 * Tests for process_docs tool.
 * Feature #4: Multi-Document Processing Tool
 *
 * Test IDs: multi-paths, multi-pattern, multi-limit, multi-aggregate
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import { loadConfig } from '../src/config.js';
import { handleProcessDocs } from '../src/tools/process-docs.js';
import type { ToolContext } from '../src/types.js';

describe('process-docs', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let repoRoot: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    repoRoot = testDir;

    mkdirSync(repoRoot, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = loadConfig(join(testDir, 'config.json'));
    config.plansPath = join(repoRoot, 'plans');
    config.docsPaths = [repoRoot];

    context = {
      db,
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

  describe('multi-paths', () => {
    it('should load explicit paths', async () => {
      // Create multiple test files
      writeFileSync(join(repoRoot, 'doc1.md'), 'Content 1', 'utf-8');
      writeFileSync(join(repoRoot, 'doc2.md'), 'Content 2', 'utf-8');
      writeFileSync(join(repoRoot, 'doc3.md'), 'Content 3', 'utf-8');

      const result = await handleProcessDocs(
        {
          paths: ['doc1.md', 'doc2.md', 'doc3.md'],
          code: 'docs.map(d => d.content)',
        },
        context
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.docs_loaded).toBe(3);
      expect(output.result).toEqual(['Content 1', 'Content 2', 'Content 3']);
      expect(output.metadata.paths).toHaveLength(3);
    });

    it('should handle docs array in code', async () => {
      writeFileSync(join(repoRoot, 'doc1.md'), 'File 1', 'utf-8');
      writeFileSync(join(repoRoot, 'doc2.md'), 'File 2', 'utf-8');

      const result = await handleProcessDocs(
        {
          paths: ['doc1.md', 'doc2.md'],
          code: 'docs.map(d => ({ path: d.path, content: d.content }))',
        },
        context
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(Array.isArray(output.result)).toBe(true);
      expect((output.result as { path: string }[])[0]).toHaveProperty('path');
      expect((output.result as { path: string }[])[0]).toHaveProperty('content');
    });
  });

  describe('multi-pattern', () => {
    it('should resolve glob pattern', async () => {
      // Create directory structure
      const plansDir = join(repoRoot, 'plans');
      mkdirSync(plansDir, { recursive: true });
      mkdirSync(join(plansDir, 'plan1'), { recursive: true });
      mkdirSync(join(plansDir, 'plan2'), { recursive: true });
      mkdirSync(join(plansDir, 'plan3'), { recursive: true });

      // Create plan.md files
      writeFileSync(join(plansDir, 'plan1', 'plan.md'), 'Plan 1', 'utf-8');
      writeFileSync(join(plansDir, 'plan2', 'plan.md'), 'Plan 2', 'utf-8');
      writeFileSync(join(plansDir, 'plan3', 'plan.md'), 'Plan 3', 'utf-8');

      const result = await handleProcessDocs(
        {
          pattern: 'plans/*/plan.md',
          code: 'docs.map(d => d.content)',
        },
        context
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.docs_loaded).toBe(3);
      expect(output.metadata.paths).toContain('plans/plan1/plan.md');
      expect(output.metadata.paths).toContain('plans/plan2/plan.md');
      expect(output.metadata.paths).toContain('plans/plan3/plan.md');
    });
  });

  describe('multi-limit', () => {
    it('should enforce max_docs limit', async () => {
      // Create many files
      const plansDir = join(repoRoot, 'plans');
      mkdirSync(plansDir, { recursive: true });

      // Create 25 plan.md files
      for (let i = 1; i <= 25; i++) {
        mkdirSync(join(plansDir, `plan${i}`), { recursive: true });
        writeFileSync(join(plansDir, `plan${i}`, 'plan.md'), `Plan ${i}`, 'utf-8');
      }

      const result = await handleProcessDocs(
        {
          pattern: 'plans/*/plan.md',
          code: 'docs.map(d => d.content)',
          max_docs: 20,
        },
        context
      );

      expect(result.isError).toBeTruthy();
      const resultText = result.content[0].text;
      expect(resultText).toContain('exceeding max_docs limit');
      expect(resultText).toContain('25');
      expect(resultText).toContain('20');
    });
  });

  describe('multi-aggregate', () => {
    it('should aggregate metadata', async () => {
      writeFileSync(join(repoRoot, 'doc1.md'), 'Content 1', 'utf-8');
      writeFileSync(join(repoRoot, 'doc2.md'), 'Content 2', 'utf-8');

      const result = await handleProcessDocs(
        {
          paths: ['doc1.md', 'doc2.md'],
          code: 'docs.length',
        },
        context
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.docs_loaded).toBe(2);
      expect(output.metadata.paths).toHaveLength(2);
      expect(output.metadata.total_size).toBeGreaterThan(0);
      expect(output.metadata.result_size).toBeGreaterThan(0);
      expect(output.execution_time_ms).toBeGreaterThan(0);
    });
  });

  describe('multi-validation', () => {
    it('should require paths OR pattern', async () => {
      const result = await handleProcessDocs(
        {
          code: 'docs.length',
        },
        context
      );

      expect(result.isError).toBeTruthy();
      const resultText = result.content[0].text;
      expect(resultText).toContain('Either paths or pattern must be provided');
    });

    it('should reject both paths AND pattern', async () => {
      const result = await handleProcessDocs(
        {
          paths: ['doc1.md'],
          pattern: '*.md',
          code: 'docs.length',
        },
        context
      );

      expect(result.isError).toBeTruthy();
      const resultText = result.content[0].text;
      expect(resultText).toContain('Cannot provide both paths and pattern');
    });

    it('should reject path traversal patterns', async () => {
      const result = await handleProcessDocs(
        {
          pattern: '../**/*.md',
          code: 'docs.length',
        },
        context
      );

      expect(result.isError).toBeTruthy();
      const resultText = result.content[0].text;
      expect(resultText).toContain('Path traversal not allowed');
    });
  });

  describe('multi-empty', () => {
    it('should return empty array for 0 docs (not error)', async () => {
      const result = await handleProcessDocs(
        {
          pattern: 'nonexistent/*.md',
          code: 'docs.length',
        },
        context
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.docs_loaded).toBe(0);
      expect(output.result).toEqual([]);
      expect(output.metadata.paths).toEqual([]);
      expect(output.metadata.total_size).toBe(0);
    });
  });

  describe('multi-aggregation', () => {
    it('should perform cross-document aggregation', async () => {
      writeFileSync(join(repoRoot, 'doc1.md'), 'Content with word count', 'utf-8');
      writeFileSync(join(repoRoot, 'doc2.md'), 'Another document', 'utf-8');
      writeFileSync(join(repoRoot, 'doc3.md'), 'Third file', 'utf-8');

      const result = await handleProcessDocs(
        {
          paths: ['doc1.md', 'doc2.md', 'doc3.md'],
          code: `docs.map(d => ({
            path: d.path,
            wordCount: d.content.split(' ').length
          }))`,
        },
        context
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.docs_loaded).toBe(3);
      expect(Array.isArray(output.result)).toBe(true);
      const results = output.result as { path: string; wordCount: number }[];
      expect(results[0]).toHaveProperty('wordCount');
      expect(results[0].wordCount).toBeGreaterThan(0);
    });
  });

  describe('multi-subcall', () => {
    it('should skip sub_query when allow_llm is false', async () => {
      writeFileSync(join(repoRoot, 'doc1.md'), 'Content 1', 'utf-8');

      const result = await handleProcessDocs(
        {
          paths: ['doc1.md'],
          code: "['item1']",
          sub_query: 'Summarize',
        },
        context
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.sub_results).toBeUndefined();
      expect(output.sub_query_skipped).toBe(true);
      expect(output.sub_query_reason).toContain('allow_llm=true');
    });

    it('should skip sub_query in auto mode for small results', async () => {
      writeFileSync(join(repoRoot, 'doc1.md'), 'Content 1', 'utf-8');

      const result = await handleProcessDocs(
        {
          paths: ['doc1.md'],
          code: "['item1']",
          sub_query: 'Summarize',
          allow_llm: true,
        },
        context
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.sub_results).toBeUndefined();
      expect(output.sub_query_skipped).toBe(true);
      expect(output.sub_query_reason).toContain('llm_policy=force');
    });
  });
});
