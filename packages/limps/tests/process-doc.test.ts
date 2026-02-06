/**
 * Tests for process_doc tool.
 * Feature #2: Document Processing Tool
 *
 * Test IDs: query-simple, query-filter, query-subcall, query-notfound
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import { createTestConfig } from './test-config-helper.js';
import { handleProcessDoc } from '../src/tools/process-doc.js';
import type { ToolContext } from '../src/types.js';
import { MockSamplingClient } from '../src/rlm/sampling.js';

describe('process-doc', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let repoRoot: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    repoRoot = testDir;

    mkdirSync(repoRoot, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = createTestConfig(testDir);
    config.plansPath = join(repoRoot, 'plans');
    config.docsPaths = [repoRoot];

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

  describe('query-simple', () => {
    it('should execute simple filter code', async () => {
      const filePath = join(repoRoot, 'test.md');
      const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
      writeFileSync(filePath, content, 'utf-8');

      const result = await handleProcessDoc(
        {
          path: 'test.md',
          code: "doc.content.split('\\n').filter(l => l.includes('2'))",
        },
        context
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.result).toEqual(['Line 2']);
      expect(output.execution_time_ms).toBeGreaterThan(0);
      expect(output.metadata.path).toBe('test.md');
      expect(output.metadata.doc_size).toBeGreaterThan(0);
    });

    it('should return execution metadata', async () => {
      const filePath = join(repoRoot, 'test.md');
      const content = 'Test content';
      writeFileSync(filePath, content, 'utf-8');

      const result = await handleProcessDoc(
        {
          path: 'test.md',
          code: 'doc.content',
        },
        context
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.execution_time_ms).toBeGreaterThan(0);
      expect(output.metadata.doc_size).toBeGreaterThan(0);
      expect(output.metadata.result_size).toBeGreaterThan(0);
      expect(output.metadata.depth).toBe(0);
    });
  });

  describe('query-filter', () => {
    it('should estimate tokens saved', async () => {
      const filePath = join(repoRoot, 'large.md');
      // Create a larger document
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
      const content = lines.join('\n');
      writeFileSync(filePath, content, 'utf-8');

      const result = await handleProcessDoc(
        {
          path: 'large.md',
          code: "doc.content.split('\\n').slice(0, 10).join('\\n')", // Filter to first 10 lines
        },
        context
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.tokens_saved).toBeGreaterThan(0);
      expect(output.metadata.doc_size).toBeGreaterThan(output.metadata.result_size);
    });
  });

  describe('query-notfound', () => {
    it('should handle non-existent document', async () => {
      const result = await handleProcessDoc(
        {
          path: 'nonexistent.md',
          code: 'doc.content',
        },
        context
      );

      expect(result.isError).toBeTruthy();
      const resultText = result.content[0].text;
      expect(resultText).toContain('File not found');
      expect(resultText).toContain('nonexistent.md');
    });
  });

  describe('query-validation', () => {
    it('should validate code before execution', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, 'Test', 'utf-8');

      const result = await handleProcessDoc(
        {
          path: 'test.md',
          code: "require('fs').readFileSync('/etc/passwd')",
        },
        context
      );

      expect(result.isError).toBeTruthy();
      const resultText = result.content[0].text;
      expect(resultText).toContain('Security error');
      expect(resultText).toContain('Prohibited module access');
    });
  });

  describe('query-subcall', () => {
    it('should process sub_query with mock client', async () => {
      const filePath = join(repoRoot, 'test.md');
      const content = 'Test content';
      writeFileSync(filePath, content, 'utf-8');

      // Create mock sampling client
      const mockClient = new MockSamplingClient();
      mockClient.setDefaultResponse((req) => {
        const content = req.messages[0]?.content || '';
        return {
          content: `Summary for: ${content.substring(0, 30)}`,
          stopReason: 'end_turn',
        };
      });

      // Add mock client to context
      const contextWithClient = {
        ...context,
        samplingClient: mockClient,
      } as ToolContext & { samplingClient: typeof mockClient };

      const result = await handleProcessDoc(
        {
          path: 'test.md',
          code: "['item1', 'item2', 'item3']",
          sub_query: 'Summarize each item',
          allow_llm: true,
          llm_policy: 'force',
        },
        contextWithClient
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.sub_results).toBeDefined();
      expect(Array.isArray(output.sub_results)).toBe(true);
      expect(output.sub_results.length).toBe(3);
      expect(output.sub_results[0]).toContain('Summary');
      expect(output.metadata.depth).toBe(1); // Depth updated after sub-calls
    });

    it('should handle sub_query with single item result', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, 'Test', 'utf-8');

      const mockClient = new MockSamplingClient();
      mockClient.setDefaultResponse(() => ({
        content: 'Single item summary',
        stopReason: 'end_turn',
      }));

      const contextWithClient = {
        ...context,
        samplingClient: mockClient,
      } as ToolContext & { samplingClient: typeof mockClient };

      const result = await handleProcessDoc(
        {
          path: 'test.md',
          code: "'single item'",
          sub_query: 'Summarize',
          allow_llm: true,
          llm_policy: 'force',
        },
        contextWithClient
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.sub_results).toBeDefined();
      expect(output.sub_results.length).toBe(1);
    });

    it('should handle sub_query errors gracefully', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, 'Test', 'utf-8');

      // Mock client that throws error
      const mockClient = new MockSamplingClient();
      mockClient.setDefaultResponse(() => {
        throw new Error('Sampling failed');
      });

      const contextWithClient = {
        ...context,
        samplingClient: mockClient,
      } as ToolContext & { samplingClient: typeof mockClient };

      const result = await handleProcessDoc(
        {
          path: 'test.md',
          code: "['item1']",
          sub_query: 'Summarize',
          allow_llm: true,
          llm_policy: 'force',
        },
        contextWithClient
      );

      expect(result.isError).toBeFalsy(); // Query itself succeeds
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.sub_results).toBeDefined();
      expect(output.sub_results[0]).toHaveProperty('error');
      // Error message should contain either the original error or the wrapper
      const errorMsg = output.sub_results[0].error;
      expect(
        errorMsg.includes('Sub-call processing failed') || errorMsg.includes('Sampling failed')
      ).toBe(true);
    });

    it('should work without sub_query (no sub-calls)', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, 'Test', 'utf-8');

      const result = await handleProcessDoc(
        {
          path: 'test.md',
          code: "'result'",
        },
        context
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.sub_results).toBeUndefined();
      expect(output.metadata.depth).toBe(0);
    });

    it('should skip sub_query when allow_llm is false', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, 'Test', 'utf-8');

      const result = await handleProcessDoc(
        {
          path: 'test.md',
          code: "['item1']",
          sub_query: 'Summarize',
        },
        context
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.sub_results).toBeUndefined();
      expect(output.sub_query_skipped).toBe(true);
      expect(output.sub_query_reason).toContain('allow_llm=true');
    });

    it('should skip sub_query in auto mode for small results', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, 'Test', 'utf-8');

      const result = await handleProcessDoc(
        {
          path: 'test.md',
          code: "['item1']",
          sub_query: 'Summarize',
          allow_llm: true,
        },
        context
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.sub_results).toBeUndefined();
      expect(output.sub_query_skipped).toBe(true);
      expect(output.sub_query_reason).toContain('llm_policy=force');
    });
  });

  describe('query-timeout', () => {
    it('should handle execution timeout', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, 'Test', 'utf-8');

      const result = await handleProcessDoc(
        {
          path: 'test.md',
          code: 'while(true) {}', // Infinite loop
          timeout: 100, // Very short timeout
        },
        context
      );

      expect(result.isError).toBeTruthy();
      const resultText = result.content[0].text;
      expect(resultText).toContain('Execution timeout');
    });
  });

  describe('result-size-limit', () => {
    it('should return isError when result exceeds 512KB', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, 'Test content', 'utf-8');

      // Generate output larger than 512KB (524288 bytes)
      const result = await handleProcessDoc(
        {
          path: 'test.md',
          code: '"a".repeat(600000)',
        },
        context
      );

      expect(result.isError).toBe(true);
      const resultText = result.content[0].text;
      expect(resultText.toLowerCase()).toContain('result size');
    });

    it('should allow results under 512KB', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, 'Test content', 'utf-8');

      const result = await handleProcessDoc(
        {
          path: 'test.md',
          code: '"a".repeat(1000)',
        },
        context
      );

      expect(result.isError).toBeFalsy();
    });
  });

  describe('query-structure', () => {
    it('should handle structured extraction', async () => {
      const filePath = join(repoRoot, 'test.md');
      const content = '# Title\n\n## Section 1\nContent 1\n\n## Section 2\nContent 2';
      writeFileSync(filePath, content, 'utf-8');

      const result = await handleProcessDoc(
        {
          path: 'test.md',
          code: `({
            title: doc.content.split('\\n')[0],
            sections: doc.content.split('##').length - 1
          })`,
        },
        context
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.result).toHaveProperty('title');
      expect(output.result).toHaveProperty('sections');
      expect((output.result as { sections: number }).sections).toBe(2);
    });
  });
});
