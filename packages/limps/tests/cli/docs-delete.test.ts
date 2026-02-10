import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { deleteDoc, getDeleteDocData } from '../../src/cli/docs-delete.js';
import type { ServerConfig } from '../../src/config.js';
import { initializeDatabase, createSchema } from '../../src/indexer.js';

describe('docs-delete', () => {
  let testDir: string;
  let docsDir: string;
  let config: ServerConfig;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-cli-docs-delete-${Date.now()}`);
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

  it('requires confirmation before deletion', async () => {
    const filePath = join(docsDir, 'doc.md');
    writeFileSync(filePath, '# Document\n\nContent.');

    const result = await getDeleteDocData(config, {
      path: 'doc.md',
      confirm: false,
    });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.pending).toBe(true);
    expect(result.preview).toBeDefined();
    expect(existsSync(filePath)).toBe(true);
  });

  it('deletes document with confirmation', async () => {
    const filePath = join(docsDir, 'doc.md');
    writeFileSync(filePath, '# Document\n\nContent.');

    const result = await getDeleteDocData(config, {
      path: 'doc.md',
      confirm: true,
    });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.deleted).toBe(true);
    expect(existsSync(filePath)).toBe(false);
  });

  it('moves to trash by default', async () => {
    const filePath = join(docsDir, 'doc.md');
    writeFileSync(filePath, '# Document');

    const result = await getDeleteDocData(config, {
      path: 'doc.md',
      confirm: true,
      permanent: false,
    });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.trash).toBeDefined();
    if (result.trash) {
      const trashPath = join(docsDir, result.trash);
      expect(existsSync(trashPath)).toBe(true);
    }
  });

  it('permanently deletes with permanent flag', async () => {
    const filePath = join(docsDir, 'doc.md');
    writeFileSync(filePath, '# Document');

    const result = await getDeleteDocData(config, {
      path: 'doc.md',
      confirm: true,
      permanent: true,
    });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.deleted).toBe(true);
    expect(existsSync(filePath)).toBe(false);
  });

  it('formats output correctly for pending deletion', async () => {
    const filePath = join(docsDir, 'doc.md');
    writeFileSync(filePath, '# Document');

    const output = await deleteDoc(config, {
      path: 'doc.md',
      confirm: false,
    });

    expect(output).toContain('⚠️  Deletion pending confirmation');
    expect(output).toContain('Path: doc.md');
    expect(output).toContain('Preview:');
    expect(output).toContain('Run with --confirm');
  });

  it('formats output correctly for confirmed deletion', async () => {
    const filePath = join(docsDir, 'doc.md');
    writeFileSync(filePath, '# Document');

    const output = await deleteDoc(config, {
      path: 'doc.md',
      confirm: true,
    });

    expect(output).toContain('✓ Document deleted successfully');
    expect(output).toContain('Path: doc.md');
  });

  it('handles non-existent file', async () => {
    const result = await getDeleteDocData(config, {
      path: 'nonexistent.md',
      confirm: true,
    });

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('not found');
  });

  it('protects system files', async () => {
    const filePath = join(docsDir, 'README.md');
    writeFileSync(filePath, '# README');

    // Move it to root level where it would be protected
    const rootReadme = join(testDir, 'README.md');
    writeFileSync(rootReadme, '# README');

    const result = await getDeleteDocData(config, {
      path: '../README.md',
      confirm: true,
    });

    expect('error' in result).toBe(true);
  });
});
