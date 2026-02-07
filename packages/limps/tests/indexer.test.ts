import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import {
  initializeDatabase,
  createSchema,
  indexDocument,
  removeDocument,
  indexAllDocuments,
  indexAllPaths,
} from '../src/indexer.js';
import { createHash } from 'crypto';

describe('index-single-document', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testFile = join(testDir, 'test.md');
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
  });

  it('should index a simple markdown document', async () => {
    const content = '# Test Document\n\nThis is test content.';
    writeFileSync(testFile, content, 'utf-8');

    const metadata = await indexDocument(db!, testFile);

    expect(metadata.path).toBe(testFile);
    expect(metadata.title).toBe('Test Document');
    expect(metadata.content).toBe(content);
    expect(metadata.hash).toBeDefined();
    expect(metadata.modifiedAt).toBeGreaterThan(0);

    // Verify database entry
    const row = db!.prepare('SELECT * FROM documents WHERE path = ?').get(testFile) as
      | {
          path: string;
          title: string;
          content: string;
          modified_at: number;
          hash: string;
        }
      | undefined;

    expect(row).toBeDefined();
    expect(row?.title).toBe('Test Document');
    expect(row?.content).toBe(content);
  });

  it('should extract title from frontmatter', async () => {
    const content = `---
title: Frontmatter Title
status: PASS
---

# Actual H1

Content here.`;
    writeFileSync(testFile, content, 'utf-8');

    const metadata = await indexDocument(db!, testFile);

    expect(metadata.title).toBe('Frontmatter Title');
  });

  it('should use H1 as title if no frontmatter', async () => {
    const content = '# H1 Title\n\nContent.';
    writeFileSync(testFile, content, 'utf-8');

    const metadata = await indexDocument(db!, testFile);

    expect(metadata.title).toBe('H1 Title');
  });

  it('should index into FTS5 table', async () => {
    const content = '# Test Document\n\nThis is test content with keywords.';
    writeFileSync(testFile, content, 'utf-8');

    await indexDocument(db!, testFile);

    // Search in FTS5 - join with documents table on path column
    const results = db!
      .prepare(
        `
      SELECT d.path, d.title
      FROM documents_fts f
      JOIN documents d ON d.path = f.path
      WHERE documents_fts MATCH 'keywords'
    `
      )
      .all() as { path: string; title: string }[];

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toBe(testFile);
  });
});

describe('extract-metadata', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testFile = join(testDir, 'test.md');
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
  });

  it('should extract YAML frontmatter', async () => {
    const content = `---
title: YAML Title
status: WIP
dependencies:
  - feature-1
  - feature-2
---

# Content`;
    writeFileSync(testFile, content, 'utf-8');

    const metadata = await indexDocument(db!, testFile);

    expect(metadata.title).toBe('YAML Title');
    expect(metadata.status).toBe('WIP');
    expect(metadata.dependencies).toEqual(['feature-1', 'feature-2']);
  });

  it('should parse Obsidian properties format (tags, aliases)', async () => {
    const content = `---
title: Obsidian Note
tags:
  - project/mobile
  - status/in-progress
aliases:
  - Mobile Project
  - App Development
status: WIP
created: 2024-01-15
updated: 2024-01-20
---

# Obsidian Note

This is an Obsidian note with properties.`;
    writeFileSync(testFile, content, 'utf-8');

    const metadata = await indexDocument(db!, testFile);

    expect(metadata.title).toBe('Obsidian Note');
    expect(metadata.status).toBe('WIP');
    // Frontmatter should be parsed correctly (we can't directly access all fields,
    // but the document should be indexed without errors)
    expect(metadata.content).toBe(content);
  });

  it('should parse complex YAML frontmatter with nested objects', async () => {
    const content = `---
title: Complex Document
metadata:
  author: John Doe
  version: 1.0
  settings:
    enabled: true
    count: 42
tags:
  - tag1
  - tag2
description: |
  This is a multiline
  description that spans
  multiple lines.
---

# Complex Document

Content here.`;
    writeFileSync(testFile, content, 'utf-8');

    const metadata = await indexDocument(db!, testFile);

    expect(metadata.title).toBe('Complex Document');
    // Document should be indexed successfully even with complex YAML
    expect(metadata.content).toBe(content);
  });

  it('should handle malformed YAML frontmatter gracefully', async () => {
    const content = `---
title: Test
invalid: [unclosed
---

# Content`;
    writeFileSync(testFile, content, 'utf-8');

    // Should not throw - should treat as no frontmatter
    const metadata = await indexDocument(db!, testFile);

    // Should still index the document (title from H1)
    expect(metadata.title).toBe('Content');
    expect(metadata.content).toBe(content);
  });

  it('should extract TOML frontmatter', async () => {
    const content = `+++
title = "TOML Title"
status = "PASS"
+++

# Content`;
    writeFileSync(testFile, content, 'utf-8');

    const metadata = await indexDocument(db!, testFile);

    expect(metadata.title).toBe('TOML Title');
    expect(metadata.status).toBe('PASS');
  });

  it('should extract dependencies from markdown links', async () => {
    const content = `# Test

Depends on: #1, #2, #3
Related: #4`;
    writeFileSync(testFile, content, 'utf-8');

    const metadata = await indexDocument(db!, testFile);

    // Should extract feature references like #1, #2, #3
    expect(metadata.dependencies).toBeDefined();
  });

  it('should calculate MD5 hash', async () => {
    const content = '# Test Document\n\nContent.';
    writeFileSync(testFile, content, 'utf-8');

    const metadata = await indexDocument(db!, testFile);

    const expectedHash = createHash('md5').update(content).digest('hex');
    expect(metadata.hash).toBe(expectedHash);
  });
});

describe('update-document', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testFile = join(testDir, 'test.md');
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
  });

  it('should update document when content changes', async () => {
    const initialContent = '# Test Document\n\nInitial content.';
    writeFileSync(testFile, initialContent, 'utf-8');

    const initialMetadata = await indexDocument(db!, testFile);
    const initialModifiedAt = initialMetadata.modifiedAt;

    // Wait a bit to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 10));

    const updatedContent = '# Test Document\n\nUpdated content.';
    writeFileSync(testFile, updatedContent, 'utf-8');

    const updatedMetadata = await indexDocument(db!, testFile);

    expect(updatedMetadata.hash).not.toBe(initialMetadata.hash);
    expect(updatedMetadata.modifiedAt).toBeGreaterThan(initialModifiedAt);

    // Verify database was updated
    const row = db!.prepare('SELECT content FROM documents WHERE path = ?').get(testFile) as
      | {
          content: string;
        }
      | undefined;
    expect(row?.content).toBe(updatedContent);
  });

  it('should skip update if hash unchanged', async () => {
    const content = '# Test Document\n\nContent.';
    writeFileSync(testFile, content, 'utf-8');

    const metadata1 = await indexDocument(db!, testFile);
    const _modifiedAt1 = metadata1.modifiedAt;

    // Touch file but don't change content
    await new Promise((resolve) => setTimeout(resolve, 10));
    writeFileSync(testFile, content, 'utf-8');

    const metadata2 = await indexDocument(db!, testFile);

    // Hash should be the same, but modifiedAt might differ
    expect(metadata2.hash).toBe(metadata1.hash);
  });

  it('should update FTS5 index on change', async () => {
    const initialContent = '# Test\n\nInitial keywords.';
    writeFileSync(testFile, initialContent, 'utf-8');
    await indexDocument(db!, testFile);

    const updatedContent = '# Test\n\nUpdated keywords.';
    writeFileSync(testFile, updatedContent, 'utf-8');
    await indexDocument(db!, testFile);

    // Old keywords should not be found (or should be replaced)
    const oldResults = db!
      .prepare(
        `
      SELECT d.path
      FROM documents_fts f
      JOIN documents d ON d.path = f.path
      WHERE documents_fts MATCH 'Initial'
    `
      )
      .all();
    // After update, old content should be gone
    expect(oldResults.length).toBe(0);

    // New keywords should be found
    const newResults = db!
      .prepare(
        `
      SELECT d.path
      FROM documents_fts f
      JOIN documents d ON d.path = f.path
      WHERE documents_fts MATCH 'Updated'
    `
      )
      .all();
    expect(newResults.length).toBeGreaterThan(0);
  });
});

describe('handle-missing-files', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testFile = join(testDir, 'test.md');
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
  });

  it('should handle missing file gracefully', async () => {
    const nonExistentFile = join(testDir, 'nonexistent.md');

    await expect(indexDocument(db!, nonExistentFile)).rejects.toThrow();
  });

  it('should mark document as MISSING when removed', async () => {
    // First index the document
    const content = '# Test Document\n\nContent.';
    writeFileSync(testFile, content, 'utf-8');
    await indexDocument(db!, testFile);

    // Remove the file
    unlinkSync(testFile);

    // Remove should mark as MISSING
    await removeDocument(db!, testFile);

    const row = db!.prepare('SELECT * FROM documents WHERE path = ?').get(testFile) as
      | {
          path: string;
          title: string;
        }
      | undefined;

    // Document should be removed from database
    expect(row).toBeUndefined();
  });

  it('should remove from FTS5 when document deleted', async () => {
    const content = '# Test\n\nKeywords here.';
    writeFileSync(testFile, content, 'utf-8');
    await indexDocument(db!, testFile);

    unlinkSync(testFile);
    await removeDocument(db!, testFile);

    // Document should be removed from content table
    const docRow = db!.prepare('SELECT * FROM documents WHERE path = ?').get(testFile);
    expect(docRow).toBeUndefined();

    // FTS5 entry should also be removed
    const results = db!
      .prepare(
        `
      SELECT f.path
      FROM documents_fts f
      WHERE documents_fts MATCH 'Keywords'
    `
      )
      .all();
    // Should have no matching documents
    expect(results.length).toBe(0);
  });
});

describe('index-all-documents', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
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

  it('should index all documents on startup', async () => {
    // Create multiple markdown files
    writeFileSync(join(testDir, 'doc1.md'), '# Document 1\n\nContent 1.', 'utf-8');
    writeFileSync(join(testDir, 'doc2.md'), '# Document 2\n\nContent 2.', 'utf-8');
    writeFileSync(join(testDir, 'doc3.md'), '# Document 3\n\nContent 3.', 'utf-8');

    const result = await indexAllDocuments(db!, testDir);

    expect(result.indexed).toBe(3);
    expect(result.errors.length).toBe(0);

    // Verify all documents in database
    const count = db!.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
    expect(count.count).toBe(3);
  });

  it('should handle indexing errors gracefully', async () => {
    // Create one valid file
    writeFileSync(join(testDir, 'valid.md'), '# Valid\n\nContent.', 'utf-8');

    // Create a file that will cause a read error by making it unreadable
    // Note: On some systems, we can't easily make files unreadable in tests
    // So we'll create a file that exists but will fail when trying to read as directory
    const invalidPath = join(testDir, 'invalid');
    mkdirSync(invalidPath, { recursive: true });
    // Try to index the directory (should fail)
    try {
      await indexDocument(db!, invalidPath);
    } catch {
      // Expected to fail
    }

    const result = await indexAllDocuments(db!, testDir);

    expect(result.indexed).toBe(1);
    // The invalid directory won't be picked up by findMarkdownFiles, so no errors expected
    // But the function should still work correctly
    expect(result.errors.length).toBe(0);
  });

  it('should skip unchanged files', async () => {
    const file1 = join(testDir, 'doc1.md');
    const file2 = join(testDir, 'doc2.md');

    writeFileSync(file1, '# Document 1\n\nContent.', 'utf-8');
    writeFileSync(file2, '# Document 2\n\nContent.', 'utf-8');

    // First indexing
    const result1 = await indexAllDocuments(db!, testDir);
    expect(result1.indexed).toBe(2);
    expect(result1.skipped).toBe(0);

    // Second indexing (no changes)
    const result2 = await indexAllDocuments(db!, testDir);
    expect(result2.indexed).toBe(0);
    expect(result2.skipped).toBe(2);
  });

  it('should update changed files', async () => {
    const file1 = join(testDir, 'doc1.md');
    writeFileSync(file1, '# Document 1\n\nInitial content.', 'utf-8');

    // First indexing
    const result1 = await indexAllDocuments(db!, testDir);
    expect(result1.indexed).toBe(1);

    // Modify file
    await new Promise((resolve) => setTimeout(resolve, 10));
    writeFileSync(file1, '# Document 1\n\nUpdated content.', 'utf-8');

    // Second indexing (file was changed, so it should be updated)
    const result2 = await indexAllDocuments(db!, testDir);
    // Should have 1 updated (the changed file) and 0 skipped
    expect(result2.updated).toBeGreaterThanOrEqual(1);
    expect(result2.skipped).toBe(0);
  });

  it('should respect ignore patterns', async () => {
    // Create files in ignored directory
    const ignoredDir = join(testDir, 'node_modules');
    mkdirSync(ignoredDir, { recursive: true });
    writeFileSync(join(ignoredDir, 'ignored.md'), '# Ignored\n\nContent.', 'utf-8');

    // Create regular file
    writeFileSync(join(testDir, 'valid.md'), '# Valid\n\nContent.', 'utf-8');

    const result = await indexAllDocuments(db!, testDir, ['node_modules']);

    expect(result.indexed).toBe(1);

    // Verify ignored file not in database
    const ignoredPath = join(ignoredDir, 'ignored.md');
    const row = db!.prepare('SELECT * FROM documents WHERE path = ?').get(ignoredPath);
    expect(row).toBeUndefined();
  });

  it('should ignore .obsidian folder', async () => {
    // Create .obsidian directory (Obsidian config folder)
    const obsidianDir = join(testDir, '.obsidian');
    mkdirSync(obsidianDir, { recursive: true });
    writeFileSync(join(obsidianDir, 'config.md'), '# Config\n\nObsidian config.', 'utf-8');

    // Create regular file
    writeFileSync(join(testDir, 'valid.md'), '# Valid\n\nContent.', 'utf-8');

    // Default ignore patterns should include .obsidian
    const result = await indexAllDocuments(db!, testDir);

    expect(result.indexed).toBe(1);

    // Verify .obsidian file not in database
    const obsidianPath = join(obsidianDir, 'config.md');
    const row = db!.prepare('SELECT * FROM documents WHERE path = ?').get(obsidianPath);
    expect(row).toBeUndefined();
  });

  it('should handle nested directories', async () => {
    const subDir = join(testDir, 'subdir');
    mkdirSync(subDir, { recursive: true });

    writeFileSync(join(testDir, 'root.md'), '# Root\n\nContent.', 'utf-8');
    writeFileSync(join(subDir, 'nested.md'), '# Nested\n\nContent.', 'utf-8');

    const result = await indexAllDocuments(db!, testDir);

    expect(result.indexed).toBe(2);

    const count = db!.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
    expect(count.count).toBe(2);
  });
});

describe('index-all-paths', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir1: string;
  let testDir2: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir1 = join(tmpdir(), `test-docs1-${Date.now()}`);
    testDir2 = join(tmpdir(), `test-docs2-${Date.now()}`);
    mkdirSync(testDir1, { recursive: true });
    mkdirSync(testDir2, { recursive: true });
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
    if (existsSync(testDir1)) {
      rmSync(testDir1, { recursive: true, force: true });
    }
    if (existsSync(testDir2)) {
      rmSync(testDir2, { recursive: true, force: true });
    }
  });

  it('should index documents from multiple paths', async () => {
    writeFileSync(join(testDir1, 'doc1.md'), '# Document 1\n\nContent.', 'utf-8');
    writeFileSync(join(testDir2, 'doc2.md'), '# Document 2\n\nContent.', 'utf-8');

    const result = await indexAllPaths(db!, [testDir1, testDir2], ['.md']);

    expect(result.indexed).toBe(2);
    expect(result.errors.length).toBe(0);

    const count = db!.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
    expect(count.count).toBe(2);
  });

  it('should index multiple file extensions', async () => {
    writeFileSync(join(testDir1, 'doc.md'), '# Markdown\n\nContent.', 'utf-8');
    writeFileSync(
      join(testDir1, 'comp.jsx'),
      'export const Comp = () => <div>Hello</div>;',
      'utf-8'
    );
    writeFileSync(
      join(testDir1, 'typed.tsx'),
      'export const Typed: FC = () => <div>World</div>;',
      'utf-8'
    );
    writeFileSync(join(testDir1, 'ignored.js'), 'console.log("ignored");', 'utf-8');

    const result = await indexAllPaths(db!, [testDir1], ['.md', '.jsx', '.tsx']);

    expect(result.indexed).toBe(3); // Should index .md, .jsx, .tsx but not .js
    expect(result.errors.length).toBe(0);
  });

  it('should deduplicate files from overlapping paths', async () => {
    const subDir = join(testDir1, 'subdir');
    mkdirSync(subDir, { recursive: true });

    writeFileSync(join(testDir1, 'root.md'), '# Root\n\nContent.', 'utf-8');
    writeFileSync(join(subDir, 'nested.md'), '# Nested\n\nContent.', 'utf-8');

    // Index from both testDir1 and subDir (overlapping paths)
    const result = await indexAllPaths(db!, [testDir1, subDir], ['.md']);

    expect(result.indexed).toBe(2); // Should deduplicate the nested.md
    expect(result.errors.length).toBe(0);
  });

  it('should handle non-existent paths gracefully', async () => {
    const nonExistent = join(tmpdir(), 'non-existent-path-12345');
    writeFileSync(join(testDir1, 'doc.md'), '# Doc\n\nContent.', 'utf-8');

    const result = await indexAllPaths(db!, [testDir1, nonExistent], ['.md']);

    expect(result.indexed).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].path).toBe(nonExistent);
  });

  it('should respect ignore patterns', async () => {
    const nodeModules = join(testDir1, 'node_modules');
    mkdirSync(nodeModules, { recursive: true });

    writeFileSync(join(testDir1, 'valid.md'), '# Valid\n\nContent.', 'utf-8');
    writeFileSync(join(nodeModules, 'ignored.md'), '# Ignored\n\nContent.', 'utf-8');

    const result = await indexAllPaths(db!, [testDir1], ['.md'], ['node_modules']);

    expect(result.indexed).toBe(1);

    // Verify ignored file not in database
    const ignoredPath = join(nodeModules, 'ignored.md');
    const row = db!.prepare('SELECT * FROM documents WHERE path = ?').get(ignoredPath);
    expect(row).toBeUndefined();
  });

  it('should ignore .obsidian folder in indexAllPaths', async () => {
    // Create .obsidian directory
    const obsidianDir = join(testDir1, '.obsidian');
    mkdirSync(obsidianDir, { recursive: true });
    writeFileSync(join(obsidianDir, 'config.md'), '# Config\n\nObsidian config.', 'utf-8');

    // Create regular file
    writeFileSync(join(testDir1, 'valid.md'), '# Valid\n\nContent.', 'utf-8');

    // Default ignore patterns should include .obsidian
    const result = await indexAllPaths(db!, [testDir1], ['.md']);

    expect(result.indexed).toBe(1);

    // Verify .obsidian file not in database
    const obsidianPath = join(obsidianDir, 'config.md');
    const row = db!.prepare('SELECT * FROM documents WHERE path = ?').get(obsidianPath);
    expect(row).toBeUndefined();
  });

  it('should skip unchanged files on re-index', async () => {
    writeFileSync(join(testDir1, 'doc.md'), '# Doc\n\nContent.', 'utf-8');

    // First indexing
    const result1 = await indexAllPaths(db!, [testDir1], ['.md']);
    expect(result1.indexed).toBe(1);
    expect(result1.skipped).toBe(0);

    // Second indexing (no changes)
    const result2 = await indexAllPaths(db!, [testDir1], ['.md']);
    expect(result2.indexed).toBe(0);
    expect(result2.skipped).toBe(1);
  });

  it('should not warn when file count is below threshold', async () => {
    // Create a small number of files (well under 200)
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(testDir1, `doc-${i}.md`), `# Doc ${i}\n\nContent.`, 'utf-8');
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await indexAllPaths(db!, [testDir1], ['.md']);
      const warningCalls = spy.mock.calls.filter((args) =>
        String(args[0]).includes('Warning: About to index')
      );
      expect(warningCalls).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('should warn when file count exceeds threshold', async () => {
    // Create >200 files to trigger the warning
    for (let i = 0; i < 201; i++) {
      writeFileSync(join(testDir1, `doc-${i}.md`), `# Doc ${i}\n\nContent.`, 'utf-8');
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await indexAllPaths(db!, [testDir1], ['.md']);
      const warningCalls = spy.mock.calls.filter((args) =>
        String(args[0]).includes('Warning: About to index')
      );
      expect(warningCalls).toHaveLength(1);
      expect(String(warningCalls[0][0])).toContain('201');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('security-hardening', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-security-${Date.now()}`);
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

  it('should skip symlink files during indexAllPaths', async () => {
    // Create a real file and a symlink pointing to it
    const realFile = join(testDir, 'real.md');
    const linkFile = join(testDir, 'link.md');
    writeFileSync(realFile, '# Real File\n\nContent.', 'utf-8');
    symlinkSync(realFile, linkFile);

    const result = await indexAllPaths(db!, [testDir], ['.md']);

    // Only the real file should be indexed (symlink skipped by findFiles)
    expect(result.indexed).toBe(1);

    // Verify only the real file is in the database
    const rows = db!.prepare('SELECT path FROM documents').all() as { path: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].path).toBe(realFile);
  });

  it('should reject symlink in indexDocument', async () => {
    const realFile = join(testDir, 'target.md');
    const linkFile = join(testDir, 'symlink.md');
    writeFileSync(realFile, '# Target', 'utf-8');
    symlinkSync(realFile, linkFile);

    await expect(indexDocument(db!, linkFile)).rejects.toThrow('Skipping unsafe file');
  });

  it('should skip files exceeding maxFileSize during indexAllPaths', async () => {
    const smallFile = join(testDir, 'small.md');
    const largeFile = join(testDir, 'large.md');
    writeFileSync(smallFile, '# Small', 'utf-8');
    writeFileSync(largeFile, 'x'.repeat(200), 'utf-8'); // 200 bytes

    // Set maxFileSize to 100 bytes
    const result = await indexAllPaths(db!, [testDir], ['.md'], undefined, undefined, 100);

    // Only the small file should be indexed
    expect(result.indexed).toBe(1);
    expect(result.skipped).toBe(1); // large file skipped

    const rows = db!.prepare('SELECT path FROM documents').all() as { path: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].path).toBe(smallFile);
  });

  it('should reject oversized file in indexDocument', async () => {
    const filePath = join(testDir, 'oversized.md');
    writeFileSync(filePath, 'x'.repeat(200), 'utf-8');

    await expect(indexDocument(db!, filePath, 100)).rejects.toThrow('Skipping unsafe file');
  });

  it('should stop recursion at maxDepth', async () => {
    // Create nested directories: depth 0, 1, 2
    const depth0 = testDir;
    const depth1 = join(depth0, 'level1');
    const depth2 = join(depth1, 'level2');
    const depth3 = join(depth2, 'level3');
    mkdirSync(depth1, { recursive: true });
    mkdirSync(depth2, { recursive: true });
    mkdirSync(depth3, { recursive: true });

    writeFileSync(join(depth0, 'root.md'), '# Root', 'utf-8');
    writeFileSync(join(depth1, 'level1.md'), '# Level 1', 'utf-8');
    writeFileSync(join(depth2, 'level2.md'), '# Level 2', 'utf-8');
    writeFileSync(join(depth3, 'level3.md'), '# Level 3', 'utf-8');

    // Set maxDepth to 2 (should find root, level1, level2 but NOT level3)
    const result = await indexAllPaths(db!, [testDir], ['.md'], undefined, 2);

    expect(result.indexed).toBe(3); // root + level1 + level2

    const rows = db!.prepare('SELECT path FROM documents ORDER BY path').all() as {
      path: string;
    }[];
    const paths = rows.map((r) => r.path);
    expect(paths).toContain(join(depth0, 'root.md'));
    expect(paths).toContain(join(depth1, 'level1.md'));
    expect(paths).toContain(join(depth2, 'level2.md'));
    expect(paths).not.toContain(join(depth3, 'level3.md'));
  });

  it('should skip symlinked directories during indexAllPaths', async () => {
    // Create a target directory with files and symlink to it
    const targetDir = join(tmpdir(), `test-symlink-target-${Date.now()}`);
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, 'secret.md'), '# Secret Data', 'utf-8');

    const linkDir = join(testDir, 'linked');
    symlinkSync(targetDir, linkDir);

    writeFileSync(join(testDir, 'normal.md'), '# Normal', 'utf-8');

    const result = await indexAllPaths(db!, [testDir], ['.md']);

    // Only the normal file should be indexed
    expect(result.indexed).toBe(1);

    // Cleanup target dir
    rmSync(targetDir, { recursive: true, force: true });
  });
});
