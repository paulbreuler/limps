import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createDoc, getCreateDocData } from '../../src/cli/docs-create.js';
import type { ServerConfig } from '../../src/config.js';
import { initializeDatabase, createSchema } from '../../src/indexer.js';

describe('docs-create', () => {
  let testDir: string;
  let docsDir: string;
  let config: ServerConfig;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-cli-docs-create-${Date.now()}`);
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

  it('creates a new document', async () => {
    const result = await getCreateDocData(config, {
      path: 'new-doc.md',
      content: '# New Document\n\nContent here.',
    });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.created).toBe(true);
    expect(result.path).toBe('new-doc.md');
    expect(result.size).toBeGreaterThan(0);

    const filePath = join(docsDir, 'new-doc.md');
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('# New Document');
  });

  it('applies template frontmatter', async () => {
    const result = await getCreateDocData(config, {
      path: 'addendum.md',
      content: '# Addendum\n\nDetails here.',
      template: 'addendum',
    });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    const filePath = join(docsDir, 'addendum.md');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('---');
    expect(content).toContain('type: "addendum"');
    expect(content).toContain('# Addendum');
  });

  it('creates parent directories', async () => {
    const result = await getCreateDocData(config, {
      path: 'subdir/nested/file.md',
      content: '# Nested File',
    });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    const filePath = join(docsDir, 'subdir', 'nested', 'file.md');
    expect(existsSync(filePath)).toBe(true);
  });

  it('formats output correctly', async () => {
    const output = await createDoc(config, {
      path: 'test.md',
      content: '# Test',
    });

    expect(output).toContain('✓ Document created successfully');
    expect(output).toContain('Path: test.md');
    expect(output).toContain('Size:');
    expect(output).toContain('Type:');
  });

  it('rejects duplicate paths', async () => {
    await getCreateDocData(config, {
      path: 'duplicate.md',
      content: '# First',
    });

    const result = await getCreateDocData(config, {
      path: 'duplicate.md',
      content: '# Second',
    });

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('already exists');
  });

  it('validates path safety', async () => {
    const result = await getCreateDocData(config, {
      path: '../../../etc/passwd',
      content: 'malicious',
    });

    expect('error' in result).toBe(true);
  });
});
