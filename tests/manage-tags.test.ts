/**
 * Tests for manage_tags tool.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type Database from 'better-sqlite3';
import { handleManageTags } from '../src/tools/manage-tags.js';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import type { ToolContext } from '../src/types.js';
import type { ServerConfig } from '../src/config.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test directory
const TEST_DIR = join(__dirname, '..', '..', '.tmp', 'manage-tags-test');
const TEST_REPO_ROOT = join(TEST_DIR, 'repo');
const TEST_DATA_DIR = join(TEST_DIR, 'data');

describe('manage-tags.ts', () => {
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
      fileExtensions: ['.md'],
      dataPath: TEST_DATA_DIR,
    };

    // Initialize database
    const dbPath = join(TEST_DATA_DIR, 'documents.sqlite');
    db = initializeDatabase(dbPath);
    createSchema(db);

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

  describe('handleManageTags', () => {
    it('lists tags from frontmatter', async () => {
      const filePath = join(TEST_REPO_ROOT, 'plans', 'test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(
        filePath,
        `---
title: Test
tags:
  - project
  - important
---
# Content
`,
        'utf-8'
      );

      const input = {
        path: 'plans/test.md',
        operation: 'list' as const,
      };

      const result = await handleManageTags(input, context);
      expect(result.isError).toBeUndefined();

      const output = JSON.parse(result.content[0].text);
      expect(output.operation).toBe('list');
      expect(output.tags).toContain('project');
      expect(output.tags).toContain('important');
      expect(output.success).toBe(true);
    });

    it('extracts inline tags from content', async () => {
      const filePath = join(TEST_REPO_ROOT, 'plans', 'test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(
        filePath,
        `---
title: Test
---
# Content

This has #inline-tag and #another-tag in the content.
`,
        'utf-8'
      );

      const input = {
        path: 'plans/test.md',
        operation: 'list' as const,
      };

      const result = await handleManageTags(input, context);
      const output = JSON.parse(result.content[0].text);
      expect(output.tags).toContain('inline-tag');
      expect(output.tags).toContain('another-tag');
    });

    it('combines frontmatter and inline tags', async () => {
      const filePath = join(TEST_REPO_ROOT, 'plans', 'test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(
        filePath,
        `---
title: Test
tags:
  - frontmatter-tag
---
# Content

Has #inline-tag here.
`,
        'utf-8'
      );

      const input = {
        path: 'plans/test.md',
        operation: 'list' as const,
      };

      const result = await handleManageTags(input, context);
      const output = JSON.parse(result.content[0].text);
      expect(output.tags).toContain('frontmatter-tag');
      expect(output.tags).toContain('inline-tag');
    });

    it('adds tags to document', async () => {
      const filePath = join(TEST_REPO_ROOT, 'plans', 'test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(
        filePath,
        `---
title: Test
tags:
  - existing
---
# Content
`,
        'utf-8'
      );

      const input = {
        path: 'plans/test.md',
        operation: 'add' as const,
        tags: ['new-tag', 'another-tag'],
      };

      const result = await handleManageTags(input, context);
      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.tags).toContain('existing');
      expect(output.tags).toContain('new-tag');
      expect(output.tags).toContain('another-tag');

      // Verify file was updated
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('new-tag');
      expect(content).toContain('another-tag');
    });

    it('removes tags from document', async () => {
      const filePath = join(TEST_REPO_ROOT, 'plans', 'test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(
        filePath,
        `---
title: Test
tags:
  - keep
  - remove
  - also-remove
---
# Content
`,
        'utf-8'
      );

      const input = {
        path: 'plans/test.md',
        operation: 'remove' as const,
        tags: ['remove', 'also-remove'],
      };

      const result = await handleManageTags(input, context);
      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.tags).toContain('keep');
      expect(output.tags).not.toContain('remove');
      expect(output.tags).not.toContain('also-remove');
    });

    it('deduplicates tags automatically', async () => {
      const filePath = join(TEST_REPO_ROOT, 'plans', 'test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(
        filePath,
        `---
title: Test
tags:
  - duplicate
---
# Content

Has #duplicate tag inline too.
`,
        'utf-8'
      );

      const input = {
        path: 'plans/test.md',
        operation: 'list' as const,
      };

      const result = await handleManageTags(input, context);
      const output = JSON.parse(result.content[0].text);
      // Should only appear once despite being in both frontmatter and inline
      const duplicateCount = output.tags.filter((t: string) => t === 'duplicate').length;
      expect(duplicateCount).toBe(1);
    });

    it('handles document without frontmatter', async () => {
      const filePath = join(TEST_REPO_ROOT, 'plans', 'test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(
        filePath,
        `# Content

Has #inline-tag here.
`,
        'utf-8'
      );

      const input = {
        path: 'plans/test.md',
        operation: 'add' as const,
        tags: ['new-tag'],
      };

      const result = await handleManageTags(input, context);
      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.tags).toContain('inline-tag');
      expect(output.tags).toContain('new-tag');

      // Verify frontmatter was added
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('---');
      expect(content).toContain('new-tag');
    });
  });
});
