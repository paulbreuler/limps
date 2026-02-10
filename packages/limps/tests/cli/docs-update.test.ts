import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { updateDoc, getUpdateDocData } from '../../src/cli/docs-update.js';
import type { ServerConfig } from '../../src/config.js';
import { initializeDatabase, createSchema } from '../../src/indexer.js';

describe('docs-update', () => {
  let testDir: string;
  let docsDir: string;
  let config: ServerConfig;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-cli-docs-update-${Date.now()}`);
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

  it('overwrites document content', async () => {
    const filePath = join(docsDir, 'doc.md');
    writeFileSync(filePath, '# Original\n\nOld content.');

    const result = await getUpdateDocData(config, {
      path: 'doc.md',
      content: '# Updated\n\nNew content.',
      mode: 'overwrite',
    });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.updated).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toBe('# Updated\n\nNew content.');
  });

  it('appends to document', async () => {
    const filePath = join(docsDir, 'doc.md');
    writeFileSync(filePath, '# Document\n\nFirst part.');

    const result = await getUpdateDocData(config, {
      path: 'doc.md',
      content: '\n\nSecond part.',
      mode: 'append',
    });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('First part.');
    expect(content).toContain('Second part.');
  });

  it('prepends to document', async () => {
    const filePath = join(docsDir, 'doc.md');
    writeFileSync(filePath, '# Document\n\nMain content.');

    const result = await getUpdateDocData(config, {
      path: 'doc.md',
      content: '---\nstatus: WIP\n---\n\n',
      mode: 'prepend',
    });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/^---/);
    expect(content).toContain('Main content.');
  });

  it('applies patch operation', async () => {
    const filePath = join(docsDir, 'doc.md');
    writeFileSync(filePath, '# Document\n\nOld text here.');

    const result = await getUpdateDocData(config, {
      path: 'doc.md',
      patch: {
        search: 'Old text',
        replace: 'New text',
      },
    });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('New text here.');
    expect(content).not.toContain('Old text');
  });

  it('creates backup by default', async () => {
    const filePath = join(docsDir, 'doc.md');
    writeFileSync(filePath, '# Document');

    const result = await getUpdateDocData(config, {
      path: 'doc.md',
      content: '# Updated',
      mode: 'overwrite',
    });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.backup).toBeDefined();
    if (result.backup) {
      // backup path is absolute, not relative
      expect(existsSync(result.backup)).toBe(true);
    }
  });

  it('formats output correctly', async () => {
    const filePath = join(docsDir, 'doc.md');
    writeFileSync(filePath, '# Document');

    const output = await updateDoc(config, {
      path: 'doc.md',
      content: '# Updated',
    });

    expect(output).toContain('✓ Document updated successfully');
    expect(output).toContain('Path: doc.md');
    expect(output).toContain('Size:');
  });

  it('handles non-existent file', async () => {
    const result = await getUpdateDocData(config, {
      path: 'nonexistent.md',
      content: 'content',
      mode: 'append',
    });

    expect('error' in result).toBe(true);
  });
});
