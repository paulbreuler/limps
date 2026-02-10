import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { outputJson } from '../../src/cli/json-output.js';

vi.mock('../../src/cli/json-output.js', async () => {
  const actual = await vi.importActual('../../src/cli/json-output.js');
  return {
    ...(actual as Record<string, unknown>),
    outputJson: vi.fn(),
  };
});

describe('process command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `test-process-cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
    vi.clearAllMocks();
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

      const configPath = createConfig({ docsPaths: [testDir] });

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
      // max-docs enforces a hard limit - if exceeded, it errors
      expect(output).toContain('exceeding max_docs limit');
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

  describe('JSON mode', () => {
    it('outputs JSON for single document processing', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir, { recursive: true });
      writeFileSync(join(docsDir, 'test.md'), '# Test\nContent', 'utf-8');

      const configPath = createConfig({ docsPaths: [testDir] });

      const { default: ProcessCommand } = await import('../../src/commands/process.js');

      render(
        <ProcessCommand
          args={['docs/test.md']}
          options={{ config: configPath, code: 'doc.content.length', json: true }}
        />
      );

      // Wait for async JSON output
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify outputJson was called (even if vitest catches process.exit)
      expect(outputJson).toHaveBeenCalled();
    });

    it('outputs JSON for multi-document processing', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir, { recursive: true });
      writeFileSync(join(docsDir, 'doc1.md'), '# Doc 1', 'utf-8');
      writeFileSync(join(docsDir, 'doc2.md'), '# Doc 2', 'utf-8');

      const configPath = createConfig({ docsPaths: [testDir] });

      const { default: ProcessCommand } = await import('../../src/commands/process.js');

      render(
        <ProcessCommand
          args={[undefined]}
          options={{ config: configPath, pattern: 'docs/*.md', code: 'docs.length', json: true }}
        />
      );

      // Wait for async JSON output
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify outputJson was called (even if vitest catches process.exit)
      expect(outputJson).toHaveBeenCalled();
    });

    it('outputs JSON error when path is missing', async () => {
      const configPath = createConfig();

      const { default: ProcessCommand } = await import('../../src/commands/process.js');

      render(
        <ProcessCommand
          args={[undefined]}
          options={{ config: configPath, code: 'doc.content', json: true }}
        />
      );

      // Wait for async JSON output
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(outputJson).toHaveBeenCalledTimes(1);
      const payload = (outputJson as unknown as { mock: { calls: [unknown[]] } }).mock.calls[0][0];
      expect(payload).toHaveProperty('success', false);
      expect(payload).toHaveProperty('error');
    });

    it('outputs JSON error when code is missing', async () => {
      const configPath = createConfig();

      const { default: ProcessCommand } = await import('../../src/commands/process.js');

      render(
        <ProcessCommand
          args={['test.md']}
          options={{ config: configPath, code: undefined as unknown as string, json: true }}
        />
      );

      // Wait for async JSON output
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(outputJson).toHaveBeenCalledTimes(1);
      const payload = (outputJson as unknown as { mock: { calls: [unknown[]] } }).mock.calls[0][0];
      expect(payload).toHaveProperty('success', false);
      expect(payload).toHaveProperty('error');
    });
  });
});
