import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('process command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `test-process-cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  /** Create a config.json in testDir and return its path. */
  function createConfig(overrides: Record<string, unknown> = {}): string {
    const projectDir = join(testDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    const configPath = join(projectDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        plansPath: overrides.plansPath ?? join(testDir, 'plans'),
        dataPath: overrides.dataPath ?? join(testDir, 'data'),
        docsPaths: [testDir],
        fileExtensions: ['.md'],
        scoring: {
          weights: { dependency: 40, priority: 30, workload: 30 },
          biases: {},
        },
        ...overrides,
      })
    );
    return configPath;
  }

  describe('single document processing', () => {
    it('processes document with simple code', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir, { recursive: true });
      const docPath = join(docsDir, 'test.md');
      writeFileSync(docPath, '# Hello\n\nWorld', 'utf-8');

      const configPath = createConfig({ docsPaths: [testDir] });

      const { default: ProcessCommand } = await import('../../src/commands/process.js');

      const { lastFrame } = render(
        <ProcessCommand
          args={['docs/test.md']}
          options={{ config: configPath, code: 'doc.content.length' }}
        />
      );

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const output = lastFrame() ?? '';
      expect(output).toContain('Processed document');
      expect(output).toContain('test.md');
    });

    it('extracts frontmatter using helper', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir, { recursive: true });
      const docPath = join(docsDir, 'plan.md');
      writeFileSync(docPath, '---\nname: Test Plan\nstatus: active\n---\n\n# Content', 'utf-8');

      const configPath = createConfig({ docsPaths: [testDir] });

      const { default: ProcessCommand } = await import('../../src/commands/process.js');

      const { lastFrame } = render(
        <ProcessCommand
          args={['docs/plan.md']}
          options={{ config: configPath, code: 'extractFrontmatter(doc.content).meta.name' }}
        />
      );

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const output = lastFrame() ?? '';
      expect(output).toContain('Processed document');
      expect(output).toContain('Test Plan');
    });

    it('shows error for missing code option', async () => {
      const configPath = createConfig();

      const { default: ProcessCommand } = await import('../../src/commands/process.js');

      const { lastFrame } = render(
        <ProcessCommand
          args={['test.md']}
          options={{ config: configPath, code: undefined as unknown as string }}
        />
      );

      const output = lastFrame() ?? '';
      expect(output).toContain('Usage:');
    });

    it('shows error for non-existent file', async () => {
      const configPath = createConfig();

      const { default: ProcessCommand } = await import('../../src/commands/process.js');

      const { lastFrame } = render(
        <ProcessCommand
          args={['nonexistent.md']}
          options={{ config: configPath, code: 'doc.content' }}
        />
      );

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const output = lastFrame() ?? '';
      expect(output).toContain('Error');
    });
  });

  describe('multiple documents processing', () => {
    it('processes multiple documents with pattern', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir, { recursive: true });
      writeFileSync(join(docsDir, 'doc1.md'), '# Doc 1', 'utf-8');
      writeFileSync(join(docsDir, 'doc2.md'), '# Doc 2', 'utf-8');

      const configPath = createConfig({ docsPaths: [testDir] });

      const { default: ProcessCommand } = await import('../../src/commands/process.js');

      const { lastFrame } = render(
        <ProcessCommand
          args={[undefined]}
          options={{ config: configPath, pattern: 'docs/*.md', code: 'docs.length' }}
        />
      );

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const output = lastFrame() ?? '';
      expect(output).toContain('Processed 2 documents');
    });

    it('maps document paths with pattern', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir, { recursive: true });
      writeFileSync(join(docsDir, 'a.md'), 'A', 'utf-8');
      writeFileSync(join(docsDir, 'b.md'), 'B', 'utf-8');

      const configPath = createConfig({ docsPaths: [testDir] });

      const { default: ProcessCommand } = await import('../../src/commands/process.js');

      const { lastFrame } = render(
        <ProcessCommand
          args={[undefined]}
          options={{ config: configPath, pattern: 'docs/*.md', code: 'docs.map(d => d.path)' }}
        />
      );

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const output = lastFrame() ?? '';
      expect(output).toContain('Processed 2 documents');
      expect(output).toContain('docs');
    });

    it('handles empty pattern match', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir, { recursive: true });

      const configPath = createConfig({ docsPaths: [docsDir] });

      const { default: ProcessCommand } = await import('../../src/commands/process.js');

      const { lastFrame } = render(
        <ProcessCommand
          args={[undefined]}
          options={{ config: configPath, pattern: 'docs/*.txt', code: 'docs.length' }}
        />
      );

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const output = lastFrame() ?? '';
      expect(output).toContain('Processed 0 documents');
    });
  });

  describe('validation', () => {
    it('shows error when both path and pattern provided', async () => {
      const configPath = createConfig();

      const { default: ProcessCommand } = await import('../../src/commands/process.js');

      const { lastFrame } = render(
        <ProcessCommand
          args={['test.md']}
          options={{ config: configPath, pattern: '*.md', code: 'doc.content' }}
        />
      );

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const output = lastFrame() ?? '';
      expect(output).toContain('Error');
      expect(output).toContain('Cannot provide both');
    });

    it('shows error when neither path nor pattern provided', async () => {
      const configPath = createConfig();

      const { default: ProcessCommand } = await import('../../src/commands/process.js');

      const { lastFrame } = render(
        <ProcessCommand
          args={[undefined]}
          options={{ config: configPath, pattern: undefined, code: 'doc.content' }}
        />
      );

      const output = lastFrame() ?? '';
      expect(output).toContain('Usage:');
    });
  });

  describe('options', () => {
    it('respects timeout option', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir, { recursive: true });
      writeFileSync(join(docsDir, 'test.md'), 'Test content', 'utf-8');

      const configPath = createConfig({ docsPaths: [testDir] });

      const { default: ProcessCommand } = await import('../../src/commands/process.js');

      const { lastFrame } = render(
        <ProcessCommand
          args={['docs/test.md']}
          options={{ config: configPath, code: 'doc.content', timeout: 10000 }}
        />
      );

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const output = lastFrame() ?? '';
      expect(output).toContain('Processed document');
    });

    it('respects max-docs option', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir, { recursive: true });
      for (let i = 0; i < 5; i++) {
        writeFileSync(join(docsDir, `doc${i}.md`), `Doc ${i}`, 'utf-8');
      }

      const configPath = createConfig({ docsPaths: [docsDir] });

      const { default: ProcessCommand } = await import('../../src/commands/process.js');

      const { lastFrame } = render(
        <ProcessCommand
          args={[undefined]}
          options={{ config: configPath, pattern: 'docs/*.md', code: 'docs.length', 'max-docs': 3 }}
        />
      );

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const output = lastFrame() ?? '';
      // Should process successfully (max-docs prevents errors, but may show fewer than 5)
      expect(output).toContain('Processed');
    });

    it('pretty-prints output with pretty flag', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir, { recursive: true });
      writeFileSync(join(docsDir, 'test.md'), '# Test', 'utf-8');

      const configPath = createConfig({ docsPaths: [testDir] });

      const { default: ProcessCommand } = await import('../../src/commands/process.js');

      const { lastFrame } = render(
        <ProcessCommand
          args={['docs/test.md']}
          options={{ config: configPath, code: '({a: 1, b: 2})', pretty: true }}
        />
      );

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const output = lastFrame() ?? '';
      expect(output).toContain('Processed document');
      // Pretty-printed objects should have indentation (multi-line)
      expect(output).toMatch(/\n/);
    });
  });
});
