import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type Database from 'better-sqlite3';
import { handleUpdateDoc, UpdateDocInputSchema } from '../src/tools/update-doc.js';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import type { ToolContext } from '../src/types.js';
import type { ServerConfig } from '../src/config.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test directory
const TEST_DIR = join(process.cwd(), '.tmp', 'update-doc-test');
const TEST_REPO_ROOT = join(TEST_DIR, 'repo');
const TEST_DATA_DIR = join(TEST_DIR, 'data');

describe('update-doc.ts', () => {
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

  describe('handleUpdateDoc', () => {
    it('replaces full content [update-full]', async () => {
      // Create initial file
      const filePath = join(TEST_REPO_ROOT, 'addendums', 'test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, 'Old content', 'utf-8');

      const input = {
        path: 'addendums/test.md',
        content: 'New content',
        createBackup: false,
        mode: 'overwrite' as const,
        force: false,
        prettyPrint: false,
      };

      const result = await handleUpdateDoc(input, context);

      expect(result.isError).toBeUndefined();
      const output = JSON.parse(result.content[0].text);
      expect(output.updated).toBe(true);
      expect(output.path).toBe('addendums/test.md');

      // Verify file content changed
      const fileContent = readFileSync(filePath, 'utf-8');
      expect(fileContent).toBe('New content');
    });

    it('applies patch operation [update-patch]', async () => {
      // Create initial file
      const filePath = join(TEST_REPO_ROOT, 'addendums', 'patch-test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, 'Version 1.0\nMore content', 'utf-8');

      const input = {
        path: 'addendums/patch-test.md',
        patch: {
          search: 'Version 1.0',
          replace: 'Version 1.1',
          all: false,
        },
        createBackup: false,
        mode: 'overwrite' as const,
        force: false,
        prettyPrint: false,
      };

      const result = await handleUpdateDoc(input, context);

      expect(result.isError).toBeUndefined();
      const fileContent = readFileSync(filePath, 'utf-8');
      expect(fileContent).toBe('Version 1.1\nMore content');
    });

    it('patch replaces all occurrences when all=true', async () => {
      // Create initial file
      const filePath = join(TEST_REPO_ROOT, 'addendums', 'patch-all.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, 'Old text\nMore old text\nEven more old text', 'utf-8');

      const input = {
        path: 'addendums/patch-all.md',
        patch: {
          search: 'old text',
          replace: 'new text',
          all: true,
        },
        createBackup: false,
        mode: 'overwrite' as const,
        force: false,
        prettyPrint: false,
      };

      await handleUpdateDoc(input, context);

      const fileContent = readFileSync(filePath, 'utf-8');
      expect(fileContent).toBe('Old text\nMore new text\nEven more new text');
    });

    it('creates backup before update [update-backup]', async () => {
      // Create initial file
      const filePath = join(TEST_REPO_ROOT, 'addendums', 'backup-test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, 'Original content', 'utf-8');

      const input = {
        path: 'addendums/backup-test.md',
        content: 'Updated content',
        createBackup: true,
        mode: 'overwrite' as const,
        force: false,
        prettyPrint: false,
      };

      const result = await handleUpdateDoc(input, context);

      expect(result.isError).toBeUndefined();
      const output = JSON.parse(result.content[0].text);
      expect(output.backup).toBeDefined();
      expect(existsSync(output.backup)).toBe(true);

      // Verify backup contains original content
      const backupContent = readFileSync(output.backup, 'utf-8');
      expect(backupContent).toBe('Original content');
    });

    it('throws NOT_FOUND if file does not exist [update-notfound]', async () => {
      const input = {
        path: 'addendums/nonexistent.md',
        content: 'New content',
        mode: 'overwrite' as const,
        createBackup: false,
        force: false,
        prettyPrint: false,
      };

      await expect(handleUpdateDoc(input, context)).rejects.toThrow('not found');
    });

    it('calculates changes (additions and deletions)', async () => {
      // Create initial file with 3 lines
      const filePath = join(TEST_REPO_ROOT, 'addendums', 'changes-test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, 'Line 1\nLine 2\nLine 3', 'utf-8');

      // Update to 5 lines
      const input = {
        path: 'addendums/changes-test.md',
        content: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5',
        createBackup: false,
        mode: 'overwrite' as const,
        force: false,
        prettyPrint: false,
      };

      const result = await handleUpdateDoc(input, context);

      expect(result.isError).toBeUndefined();
      const output = JSON.parse(result.content[0].text);
      expect(output.changes).toBeDefined();
      expect(output.changes?.additions).toBe(2);
      expect(output.changes?.deletions).toBe(0);
    });

    it('re-indexes file after update [index-update]', async () => {
      // Create initial file
      const filePath = join(TEST_REPO_ROOT, 'addendums', 'reindex-test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, 'Original content', 'utf-8');

      // Index it first
      const { indexDocument } = await import('../src/indexer.js');
      await indexDocument(db, filePath);

      // Update file
      const input = {
        path: 'addendums/reindex-test.md',
        content: 'Updated content',
        createBackup: false,
        mode: 'overwrite' as const,
        force: false,
        prettyPrint: false,
      };

      await handleUpdateDoc(input, context);

      // Check if index was updated
      const indexed = db.prepare('SELECT content FROM documents WHERE path = ?').get(filePath) as
        | { content: string }
        | undefined;
      expect(indexed).toBeDefined();
      expect(indexed?.content).toBe('Updated content');
    });

    it('warns on frontmatter removal unless force=true', async () => {
      // Create file with frontmatter
      const filePath = join(TEST_REPO_ROOT, 'addendums', 'frontmatter-test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, '---\nversion: "1.0"\n---\n\n# Content', 'utf-8');

      // Try to remove frontmatter without force
      const input = {
        path: 'addendums/frontmatter-test.md',
        content: '# Content without frontmatter',
        createBackup: false,
        force: false,
        mode: 'overwrite' as const,
        prettyPrint: false,
      };

      const result = await handleUpdateDoc(input, context);

      expect(result.isError).toBe(true);
      const output = JSON.parse(result.content[0].text);
      expect(output.warning).toContain('Frontmatter removed');
    });

    it('allows frontmatter removal with force=true', async () => {
      // Create file with frontmatter
      const filePath = join(TEST_REPO_ROOT, 'addendums', 'frontmatter-force-test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, '---\nversion: "1.0"\n---\n\n# Content', 'utf-8');

      // Remove frontmatter with force
      const input = {
        path: 'addendums/frontmatter-force-test.md',
        content: '# Content without frontmatter',
        createBackup: false,
        force: true,
        mode: 'overwrite' as const,
        prettyPrint: false,
      };

      const result = await handleUpdateDoc(input, context);

      expect(result.isError).toBeUndefined();
      const fileContent = readFileSync(filePath, 'utf-8');
      expect(fileContent).toBe('# Content without frontmatter');
      expect(fileContent).not.toContain('---');
    });

    it('warns if patch has no matches', async () => {
      // Create initial file
      const filePath = join(TEST_REPO_ROOT, 'addendums', 'no-match.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, 'Some content', 'utf-8');

      const input = {
        path: 'addendums/no-match.md',
        patch: {
          search: 'Nonexistent text',
          replace: 'Replacement',
          all: false,
        },
        createBackup: false,
        mode: 'overwrite' as const,
        force: false,
        prettyPrint: false,
      };

      const result = await handleUpdateDoc(input, context);

      expect(result.isError).toBe(true);
      const output = JSON.parse(result.content[0].text);
      expect(output.warning).toContain('no matches');
    });

    it('warns on protected plan.md file unless force=true', async () => {
      // Create plan directory and plan.md file
      const planDir = join(TEST_REPO_ROOT, 'plans', '0001-test');
      const planFilePath = join(planDir, 'plan.md');
      mkdirSync(planDir, { recursive: true });
      writeFileSync(planFilePath, '# Test Plan\n\nOriginal content', 'utf-8');

      // Try to update protected plan.md without force
      const input = {
        path: 'plans/0001-test/plan.md',
        content: '# Test Plan\n\nUpdated content',
        createBackup: false,
        force: false,
        mode: 'overwrite' as const,
        prettyPrint: false,
      };

      const result = await handleUpdateDoc(input, context);

      expect(result.isError).toBe(true);
      const output = JSON.parse(result.content[0].text);
      expect(output.warning).toContain('Protected plan file');
      expect(output.warning).toContain('force: true');

      // Verify file was not changed
      const fileContent = readFileSync(planFilePath, 'utf-8');
      expect(fileContent).toBe('# Test Plan\n\nOriginal content');
    });

    it('allows updating protected plan.md file with force=true', async () => {
      // Create plan directory and plan.md file
      const planDir = join(TEST_REPO_ROOT, 'plans', '0002-another-test');
      const planFilePath = join(planDir, 'plan.md');
      mkdirSync(planDir, { recursive: true });
      writeFileSync(planFilePath, '# Another Plan\n\nOriginal', 'utf-8');

      // Update protected plan.md with force
      const input = {
        path: 'plans/0002-another-test/plan.md',
        content: '# Another Plan\n\nUpdated',
        createBackup: false,
        force: true,
        mode: 'overwrite' as const,
        prettyPrint: false,
      };

      const result = await handleUpdateDoc(input, context);

      expect(result.isError).toBeUndefined();
      const fileContent = readFileSync(planFilePath, 'utf-8');
      expect(fileContent).toBe('# Another Plan\n\nUpdated');
    });

    it('allows updating non-plan.md files in plans directory without force', async () => {
      // Create plan directory with README.md
      const planDir = join(TEST_REPO_ROOT, 'plans', '0003-test');
      mkdirSync(planDir, { recursive: true });
      const readmePath = join(planDir, 'README.md');
      writeFileSync(readmePath, 'Original README', 'utf-8');

      // Update README.md (not protected)
      const input = {
        path: 'plans/0003-test/README.md',
        content: 'Updated README',
        createBackup: false,
        force: false,
        mode: 'overwrite' as const,
        prettyPrint: false,
      };

      const result = await handleUpdateDoc(input, context);

      expect(result.isError).toBeUndefined();
      const fileContent = readFileSync(readmePath, 'utf-8');
      expect(fileContent).toBe('Updated README');
    });
  });

  describe('UpdateDocInputSchema', () => {
    it('validates required path', () => {
      expect(() =>
        UpdateDocInputSchema.parse({
          path: 'test.md',
        })
      ).toThrow();
    });

    it('requires either content or patch', () => {
      const valid1 = UpdateDocInputSchema.parse({
        path: 'test.md',
        content: 'Content',
      });
      expect(valid1.content).toBe('Content');

      const valid2 = UpdateDocInputSchema.parse({
        path: 'test.md',
        patch: { search: 'old', replace: 'new' },
      });
      expect(valid2.patch).toBeDefined();
    });

    it('rejects when neither content nor patch provided', () => {
      expect(() =>
        UpdateDocInputSchema.parse({
          path: 'test.md',
        })
      ).toThrow();
    });

    it('defaults createBackup to true', () => {
      const valid = UpdateDocInputSchema.parse({
        path: 'test.md',
        content: 'Content',
      });
      expect(valid.createBackup).toBe(true);
    });

    it('defaults force to false', () => {
      const valid = UpdateDocInputSchema.parse({
        path: 'test.md',
        content: 'Content',
      });
      expect(valid.force).toBe(false);
    });
  });

  describe('write modes', () => {
    it('appends content to existing file', async () => {
      const filePath = join(TEST_REPO_ROOT, 'addendums', 'test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, 'Initial content\n', 'utf-8');

      const input = {
        path: 'addendums/test.md',
        content: 'Appended content',
        mode: 'append' as const,
        createBackup: false,
        force: false,
        prettyPrint: false,
      };

      const result = await handleUpdateDoc(input, context);
      expect(result.isError).toBeUndefined();

      const finalContent = readFileSync(filePath, 'utf-8');
      expect(finalContent).toContain('Initial content');
      expect(finalContent).toContain('Appended content');
    });

    it('prepends content to existing file', async () => {
      const filePath = join(TEST_REPO_ROOT, 'addendums', 'test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, 'Original content\n', 'utf-8');

      const input = {
        path: 'addendums/test.md',
        content: 'Prepended content\n',
        mode: 'prepend' as const,
        createBackup: false,
        force: false,
        prettyPrint: false,
      };

      const result = await handleUpdateDoc(input, context);
      expect(result.isError).toBeUndefined();

      const finalContent = readFileSync(filePath, 'utf-8');
      expect(finalContent).toContain('Prepended content');
      expect(finalContent).toContain('Original content');
      expect(finalContent.indexOf('Prepended')).toBeLessThan(finalContent.indexOf('Original'));
    });

    it('merges frontmatter when appending', async () => {
      const filePath = join(TEST_REPO_ROOT, 'addendums', 'test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(
        filePath,
        `---
title: Original
tags:
  - tag1
---
# Original Content
`,
        'utf-8'
      );

      const input = {
        path: 'addendums/test.md',
        content: `---
title: Updated
tags:
  - tag2
---
# New Content
`,
        mode: 'append' as const,
        createBackup: false,
        force: false,
        prettyPrint: false,
      };

      const result = await handleUpdateDoc(input, context);
      expect(result.isError).toBeUndefined();

      const finalContent = readFileSync(filePath, 'utf-8');
      // Frontmatter should be merged (new values override old)
      expect(finalContent).toContain('title: Updated');
      // Content should be appended
      expect(finalContent).toContain('Original Content');
      expect(finalContent).toContain('New Content');
    });
  });
});
