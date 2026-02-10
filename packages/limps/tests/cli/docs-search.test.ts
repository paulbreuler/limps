import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { searchDocs, getSearchDocsData } from '../../src/cli/docs-search.js';
import type { ServerConfig } from '../../src/config.js';
import { initializeDatabase, createSchema, indexDocument } from '../../src/indexer.js';

describe('docs-search', () => {
  let testDir: string;
  let docsDir: string;
  let config: ServerConfig;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-cli-docs-search-${Date.now()}`);
    docsDir = join(testDir, 'docs');
    mkdirSync(docsDir, { recursive: true });

    config = {
      plansPath: join(testDir, 'plans'),
      docsPaths: [docsDir],
      dataPath: join(testDir, 'data'),
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
    };

    // Ensure data directory exists and initialize database
    mkdirSync(config.dataPath, { recursive: true });
    const dbPath = join(config.dataPath, 'documents.sqlite');
    const db = initializeDatabase(dbPath);
    createSchema(db);
    db.close();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('searches for text in documents', async () => {
    const doc1Path = join(docsDir, 'doc1.md');
    const doc2Path = join(docsDir, 'doc2.md');
    writeFileSync(doc1Path, '# Document 1\n\nThis is about authentication.');
    writeFileSync(doc2Path, '# Document 2\n\nThis is about authorization.');

    // Re-index after creating files
    const dbPath = join(config.dataPath, 'documents.sqlite');
    const db = initializeDatabase(dbPath);
    createSchema(db);
    await indexDocument(db, doc1Path);
    await indexDocument(db, doc2Path);
    db.close();

    const result = await getSearchDocsData(config, { query: 'authentication' });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.length).toBeGreaterThan(0);
    const firstResult = result[0];
    expect(firstResult.p || firstResult.path).toContain('doc1.md');
  });

  it('returns empty array for no results', async () => {
    writeFileSync(join(docsDir, 'doc1.md'), '# Document 1\n\nSome content.');

    // Re-index
    const dbPath = join(config.dataPath, 'documents.sqlite');
    const db = initializeDatabase(dbPath);
    createSchema(db);
    db.close();

    const result = await getSearchDocsData(config, { query: 'nonexistent' });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.length).toBe(0);
  });

  it('respects limit parameter', async () => {
    const dbPath = join(config.dataPath, 'documents.sqlite');
    const db = initializeDatabase(dbPath);
    createSchema(db);

    for (let i = 0; i < 25; i++) {
      const filePath = join(docsDir, `doc${i}.md`);
      writeFileSync(filePath, `# Document ${i}\n\nSearch term here.`);
      await indexDocument(db, filePath);
    }

    db.close();

    const result = await getSearchDocsData(config, { query: 'Search', limit: 10 });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('formats output correctly', async () => {
    const testPath = join(docsDir, 'test.md');
    writeFileSync(testPath, '# Test\n\nHello world');

    // Re-index
    const dbPath = join(config.dataPath, 'documents.sqlite');
    const db = initializeDatabase(dbPath);
    createSchema(db);
    await indexDocument(db, testPath);
    db.close();

    const output = await searchDocs(config, { query: 'Hello' });

    expect(output).toContain('Search results for:');
    expect(output).toContain('Hello');
    expect(output).toContain('Total:');
  });

  it('handles empty query gracefully', async () => {
    const result = await getSearchDocsData(config, { query: '' });

    expect('error' in result).toBe(true);
  });

  it('searches in frontmatter when enabled', async () => {
    const docPath = join(docsDir, 'doc.md');
    writeFileSync(docPath, '---\nstatus: WIP\nauthor: test\n---\n\n# Document\n\nContent.');

    // Re-index
    const dbPath = join(config.dataPath, 'documents.sqlite');
    const db = initializeDatabase(dbPath);
    createSchema(db);
    await indexDocument(db, docPath);
    db.close();

    const result = await getSearchDocsData(config, {
      query: 'WIP',
      searchFrontmatter: true,
    });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.length).toBeGreaterThan(0);
  });
});
