import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type Database from 'better-sqlite3';
import { handleCreateDoc, CreateDocInputSchema, TEMPLATES } from '../src/tools/create-doc.js';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import type { ToolContext } from '../src/types.js';
import type { ServerConfig } from '../src/config.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test directory
const TEST_DIR = join(__dirname, '..', '..', '.tmp', 'create-doc-test');
const TEST_REPO_ROOT = join(TEST_DIR, 'repo');
const TEST_DATA_DIR = join(TEST_DIR, 'data');

describe('create-doc.ts', () => {
  let db: Database.Database;
  let context: ToolContext;
  let config: ServerConfig;

  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_REPO_ROOT, { recursive: true });
    mkdirSync(TEST_DATA_DIR, { recursive: true });

    // Create test config
    config = {
      plansPath: join(TEST_REPO_ROOT, 'plans'),
      docsPaths: [TEST_REPO_ROOT],
      fileExtensions: ['.md', '.jsx'],
      dataPath: TEST_DATA_DIR,
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
    };

    // Initialize database
    const dbPath = join(TEST_DATA_DIR, 'documents.sqlite');
    db = initializeDatabase(dbPath);
    createSchema(db);

    // Create coordination state

    // Create tool context
    context = {
      db,
      config,
    };
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('handleCreateDoc', () => {
    it('creates file with content [create-basic]', async () => {
      const input = {
        path: 'addendums/test.md',
        content: '# Test Document\n\nContent here.',
        template: 'none' as const,
      };

      const result = await handleCreateDoc(input, context);

      expect(result.isError).toBeUndefined();
      const output = JSON.parse(result.content[0].text);
      expect(output.created).toBe(true);
      expect(output.path).toBe('addendums/test.md');
      expect(output.type).toBe('md');

      // Verify file exists
      const filePath = join(TEST_REPO_ROOT, 'addendums', 'test.md');
      expect(existsSync(filePath)).toBe(true);
      const fileContent = readFileSync(filePath, 'utf-8');
      expect(fileContent).toBe('# Test Document\n\nContent here.');
    });

    it('applies template frontmatter [create-template]', async () => {
      const input = {
        path: 'addendums/template-test.md',
        content: '# Template Test',
        template: 'addendum' as const,
      };

      const result = await handleCreateDoc(input, context);

      expect(result.isError).toBeUndefined();
      const output = JSON.parse(result.content[0].text);
      expect(output.created).toBe(true);

      // Verify file has frontmatter
      const filePath = join(TEST_REPO_ROOT, 'addendums', 'template-test.md');
      const fileContent = readFileSync(filePath, 'utf-8');
      expect(fileContent).toContain('---');
      expect(fileContent).toContain('type: "addendum"');
      expect(fileContent).toContain('author: ""');
      expect(fileContent).toContain('# Template Test');
      // Check date was replaced
      expect(fileContent).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(fileContent).not.toContain('{{DATE}}');
    });

    it('replaces {{DATE}} in template', async () => {
      const input = {
        path: 'research/dated-test.md',
        content: '# Dated Test',
        template: 'research' as const,
      };

      await handleCreateDoc(input, context);

      const filePath = join(TEST_REPO_ROOT, 'research', 'dated-test.md');
      const fileContent = readFileSync(filePath, 'utf-8');
      const dateMatch = fileContent.match(/date: "(\d{4}-\d{2}-\d{2})"/);
      expect(dateMatch).not.toBeNull();
      if (dateMatch) {
        const date = dateMatch[1];
        expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(date).not.toBe('{{DATE}}');
      }
    });

    it('throws ALREADY_EXISTS if file exists [create-exists]', async () => {
      // Create file first
      const filePath = join(TEST_REPO_ROOT, 'addendums', 'existing.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, 'Existing content', 'utf-8');

      const input = {
        path: 'addendums/existing.md',
        content: 'New content',
        template: 'none' as const,
      };

      await expect(handleCreateDoc(input, context)).rejects.toThrow('already exists');
    });

    it('throws RESTRICTED_PATH for non-writable paths [create-restricted]', async () => {
      const input = {
        path: '.cursor/hack.md',
        content: 'Hack attempt',
        template: 'none' as const,
      };

      await expect(handleCreateDoc(input, context)).rejects.toThrow('restricted');
    });

    it('creates parent directories', async () => {
      const input = {
        path: 'addendums/nested/deep/test.md',
        content: 'Nested content',
        template: 'none' as const,
      };

      const result = await handleCreateDoc(input, context);

      expect(result.isError).toBeUndefined();
      const filePath = join(TEST_REPO_ROOT, 'addendums', 'nested', 'deep', 'test.md');
      expect(existsSync(filePath)).toBe(true);
    });

    it('indexes new file [index-create]', async () => {
      const input = {
        path: 'examples/test-component.jsx',
        content: 'import React from "react";',
        template: 'none' as const,
      };

      await handleCreateDoc(input, context);

      // Check if file is indexed
      const filePath = join(TEST_REPO_ROOT, 'examples', 'test-component.jsx');
      const indexed = db.prepare('SELECT path FROM documents WHERE path = ?').get(filePath);
      expect(indexed).toBeDefined();
    });

    it('creates JSX example without frontmatter', async () => {
      const input = {
        path: 'examples/component.jsx',
        content: 'export default function Component() { return null; }',
        template: 'example' as const,
      };

      await handleCreateDoc(input, context);

      const filePath = join(TEST_REPO_ROOT, 'examples', 'component.jsx');
      const fileContent = readFileSync(filePath, 'utf-8');
      expect(fileContent).toBe('export default function Component() { return null; }');
      expect(fileContent).not.toContain('---');
    });
  });

  describe('TEMPLATES', () => {
    it('defines addendum template', () => {
      expect(TEMPLATES.addendum).toContain('type: "addendum"');
      expect(TEMPLATES.addendum).toContain('{{DATE}}');
    });

    it('defines research template', () => {
      expect(TEMPLATES.research).toContain('type: "research"');
      expect(TEMPLATES.research).toContain('{{DATE}}');
    });

    it('defines empty example template', () => {
      expect(TEMPLATES.example).toBe('');
    });

    it('defines empty none template', () => {
      expect(TEMPLATES.none).toBe('');
    });
  });

  describe('CreateDocInputSchema', () => {
    it('validates required fields', () => {
      const valid = CreateDocInputSchema.parse({
        path: 'test.md',
        content: 'Content',
      });
      expect(valid.template).toBe('none');
    });

    it('validates template enum', () => {
      const valid = CreateDocInputSchema.parse({
        path: 'test.md',
        content: 'Content',
        template: 'addendum',
      });
      expect(valid.template).toBe('addendum');
    });

    it('rejects invalid template', () => {
      expect(() =>
        CreateDocInputSchema.parse({
          path: 'test.md',
          content: 'Content',
          template: 'invalid',
        })
      ).toThrow();
    });
  });
});
