import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema, indexDocument } from '../src/indexer.js';
import { createTestConfig } from './test-config-helper.js';
import { handleSearchDocs } from '../src/tools/search-docs.js';
import type { ToolContext } from '../src/types.js';

describe('search-query', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');

    mkdirSync(plansDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    // Create test documents
    const doc1Path = join(plansDir, 'plan1.md');
    writeFileSync(
      doc1Path,
      '# Plan One\n\nThis is about testing and search functionality.',
      'utf-8'
    );
    await indexDocument(db, doc1Path);

    const doc2Path = join(plansDir, 'plan2.md');
    writeFileSync(
      doc2Path,
      '# Plan Two\n\nThis document discusses implementation details.',
      'utf-8'
    );
    await indexDocument(db, doc2Path);

    const config = createTestConfig(testDir);
    config.plansPath = plansDir;

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

  it('should search with query', async () => {
    const result = await handleSearchDocs({ query: 'testing' }, context);

    expect(result.isError).toBeFalsy();
    const resultText = result.content[0].text;
    expect(resultText).toContain('Plan One');
    expect(resultText).toContain('testing');
  });
});

describe('search-ranking', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');

    mkdirSync(plansDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    // Create documents with different relevance
    const doc1Path = join(plansDir, 'high-relevance.md');
    writeFileSync(
      doc1Path,
      '# High Relevance\n\nThis document contains the search term multiple times. Search term appears here. And again: search term.',
      'utf-8'
    );
    await indexDocument(db, doc1Path);

    const doc2Path = join(plansDir, 'low-relevance.md');
    writeFileSync(doc2Path, '# Low Relevance\n\nThis document mentions search term once.', 'utf-8');
    await indexDocument(db, doc2Path);

    const config = createTestConfig(testDir);
    config.plansPath = plansDir;

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

  it('should rank results by relevance', async () => {
    const result = await handleSearchDocs({ query: 'search term' }, context);

    expect(result.isError).toBeFalsy();
    const resultText = result.content[0].text;
    // High relevance should appear first
    const highRelevanceIndex = resultText.indexOf('high-relevance');
    const lowRelevanceIndex = resultText.indexOf('low-relevance');
    expect(highRelevanceIndex).toBeGreaterThan(-1);
    expect(lowRelevanceIndex).toBeGreaterThan(-1);
    // High relevance should come before low relevance
    expect(highRelevanceIndex).toBeLessThan(lowRelevanceIndex);
  });
});

describe('limit-results', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');

    mkdirSync(plansDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    // Create multiple documents
    for (let i = 1; i <= 10; i++) {
      const docPath = join(plansDir, `doc${i}.md`);
      writeFileSync(docPath, `# Document ${i}\n\nThis document contains the search term.`, 'utf-8');
      await indexDocument(db, docPath);
    }

    const config = createTestConfig(testDir);
    config.plansPath = plansDir;

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

  it('should limit results', async () => {
    const result = await handleSearchDocs({ query: 'search term', limit: 5 }, context);

    expect(result.isError).toBeFalsy();
    const resultText = result.content[0].text;
    // Should only return 5 results
    const matches = resultText.match(/Document \d+/g);
    expect(matches?.length).toBeLessThanOrEqual(5);
  });
});

describe('empty-results', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');

    mkdirSync(plansDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    // Create document without search term
    const docPath = join(plansDir, 'other-doc.md');
    writeFileSync(
      docPath,
      '# Other Document\n\nThis document does not contain the search term.',
      'utf-8'
    );
    await indexDocument(db, docPath);

    const config = createTestConfig(testDir);
    config.plansPath = plansDir;

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

  it('should return empty results for nonexistent query', async () => {
    const result = await handleSearchDocs(
      { query: 'nonexistent term that does not exist anywhere' },
      context
    );

    expect(result.isError).toBeFalsy();
    const resultText = result.content[0].text;
    expect(resultText.toLowerCase()).toContain('no results');
  });
});

describe('enhanced-search-features', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');

    mkdirSync(plansDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    // Create test document with frontmatter
    const docPath = join(plansDir, 'test.md');
    writeFileSync(
      docPath,
      `---
title: Test Document
tags:
  - project
  - important
status: WIP
---

# Content

This document contains machine learning information.
It also mentions machine learning again.
`,
      'utf-8'
    );
    await indexDocument(db, docPath);

    const config = createTestConfig(testDir);
    config.plansPath = plansDir;

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

  it('searches in frontmatter when searchFrontmatter is true', async () => {
    const result = await handleSearchDocs(
      {
        query: 'WIP',
        searchContent: false,
        searchFrontmatter: true,
      },
      context
    );

    expect(result.isError).toBeFalsy();
    const results = JSON.parse(result.content[0].text);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].p || results[0].path).toContain('test.md');
  });

  it('returns excerpts with context', async () => {
    const result = await handleSearchDocs(
      {
        query: 'machine learning',
        searchContent: true,
      },
      context
    );

    expect(result.isError).toBeFalsy();
    const results = JSON.parse(result.content[0].text);
    expect(results[0].ex || results[0].excerpt).toContain('machine learning');
    // Excerpt should have context around match
    expect((results[0].ex || results[0].excerpt).length).toBeGreaterThan('machine learning'.length);
  });

  it('returns match count', async () => {
    const result = await handleSearchDocs(
      {
        query: 'machine learning',
        searchContent: true,
      },
      context
    );

    expect(result.isError).toBeFalsy();
    const results = JSON.parse(result.content[0].text);
    // Document has "machine learning" twice
    expect(results[0].mc || results[0].matchCount).toBeGreaterThanOrEqual(2);
  });

  it('returns line number of first match', async () => {
    const result = await handleSearchDocs(
      {
        query: 'machine learning',
        searchContent: true,
      },
      context
    );

    expect(result.isError).toBeFalsy();
    const results = JSON.parse(result.content[0].text);
    expect(results[0].ln || results[0].lineNumber).toBeGreaterThan(0);
  });

  it('uses minified field names when prettyPrint is false', async () => {
    const result = await handleSearchDocs(
      {
        query: 'machine',
        searchContent: true,
        prettyPrint: false,
      },
      context
    );

    expect(result.isError).toBeFalsy();
    const results = JSON.parse(result.content[0].text);
    // Should have minified field names
    expect(results[0].p).toBeDefined(); // path
    expect(results[0].t).toBeDefined(); // title
    expect(results[0].ex).toBeDefined(); // excerpt
    expect(results[0].mc).toBeDefined(); // matchCount
    expect(results[0].ln).toBeDefined(); // lineNumber
  });

  it('uses full field names when prettyPrint is true', async () => {
    const result = await handleSearchDocs(
      {
        query: 'machine',
        searchContent: true,
        prettyPrint: true,
      },
      context
    );

    expect(result.isError).toBeFalsy();
    const results = JSON.parse(result.content[0].text);
    // Should have both minified and full field names
    expect(results[0].path).toBeDefined();
    expect(results[0].title).toBeDefined();
    expect(results[0].excerpt).toBeDefined();
    expect(results[0].matchCount).toBeDefined();
    expect(results[0].lineNumber).toBeDefined();
  });
});
