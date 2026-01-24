import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema, indexDocument } from '../src/indexer.js';
import { readCoordination } from '../src/coordination.js';
import { loadConfig } from '../src/config.js';
import { handleSearchDocs } from '../src/tools/search-docs.js';
import type { ToolContext } from '../src/types.js';

describe('search-query', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    coordinationPath = join(testDir, 'coordination.json');

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

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = plansDir;

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
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    coordinationPath = join(testDir, 'coordination.json');

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
    writeFileSync(doc2Path, '# Low Relevance\n\nThis document mentions the term once.', 'utf-8');
    await indexDocument(db, doc2Path);

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = plansDir;

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
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    coordinationPath = join(testDir, 'coordination.json');

    mkdirSync(plansDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    // Create multiple documents
    for (let i = 1; i <= 10; i++) {
      const docPath = join(plansDir, `doc${i}.md`);
      writeFileSync(docPath, `# Document ${i}\n\nThis document contains the search term.`, 'utf-8');
      await indexDocument(db, docPath);
    }

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = plansDir;

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
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    coordinationPath = join(testDir, 'coordination.json');

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

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = plansDir;

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
