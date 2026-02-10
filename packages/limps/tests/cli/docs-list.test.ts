import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { listDocs, getDocsListData } from '../../src/cli/docs-list.js';
import type { ServerConfig } from '../../src/config.js';

describe('docs-list', () => {
  let testDir: string;
  let docsDir: string;
  let config: ServerConfig;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-cli-docs-list-${Date.now()}`);
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
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('lists files and directories', async () => {
    writeFileSync(join(docsDir, 'file1.md'), '# File 1\n\nContent here.');
    writeFileSync(join(docsDir, 'file2.md'), '# File 2\n\nMore content.');
    mkdirSync(join(docsDir, 'subdir'));
    writeFileSync(join(docsDir, 'subdir', 'file3.md'), '# File 3\n');

    const result = await getDocsListData(config);

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.entries.length).toBeGreaterThan(0);
    const fileNames = result.entries.map((e) => e.name);
    expect(fileNames).toContain('file1.md');
    expect(fileNames).toContain('file2.md');
    expect(fileNames).toContain('subdir');
  });

  it('filters by pattern', async () => {
    writeFileSync(join(docsDir, 'doc1.md'), '# Doc 1');
    writeFileSync(join(docsDir, 'doc2.txt'), 'Text file');
    writeFileSync(join(docsDir, 'readme.md'), '# README');

    const result = await getDocsListData(config, { pattern: '*.md' });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    const fileNames = result.entries.map((e) => e.name);
    expect(fileNames).toContain('doc1.md');
    expect(fileNames).toContain('readme.md');
    expect(fileNames).not.toContain('doc2.txt');
  });

  it('respects depth parameter', async () => {
    mkdirSync(join(docsDir, 'level1'));
    writeFileSync(join(docsDir, 'level1', 'file.md'), '# File');
    mkdirSync(join(docsDir, 'level1', 'level2'));
    writeFileSync(join(docsDir, 'level1', 'level2', 'deep.md'), '# Deep');

    const shallowResult = await getDocsListData(config, { depth: 1 });
    expect('error' in shallowResult).toBe(false);
    if ('error' in shallowResult) return;

    const shallowNames = shallowResult.entries.map((e) => e.name);
    expect(shallowNames).toContain('level1');
    // At depth 1, we should see immediate children but not deeper files
    // The tool returns flattened results, so we check the count
    expect(shallowResult.entries.length).toBeLessThanOrEqual(3);

    const deepResult = await getDocsListData(config, { depth: 3 });
    expect('error' in deepResult).toBe(false);
    if ('error' in deepResult) return;

    const deepNames = deepResult.entries.map((e) => e.name);
    expect(deepNames).toContain('level1');
    expect(deepNames).toContain('file.md');
    // At depth 3, we should see all files including nested ones
    expect(deepResult.entries.length).toBeGreaterThan(shallowResult.entries.length);
  });

  it('formats output correctly', async () => {
    writeFileSync(join(docsDir, 'test.md'), '# Test');

    const output = await listDocs(config);

    expect(output).toContain('Documents in:');
    expect(output).toContain('test.md');
    expect(output).toContain('Total:');
  });

  it('handles empty directory', async () => {
    const output = await listDocs(config);

    expect(output).toContain('No files found');
  });

  it('handles non-existent path', async () => {
    const result = await getDocsListData(config, { path: 'nonexistent' });

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('not found');
  });
});
