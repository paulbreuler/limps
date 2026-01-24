/**
 * Tests for sandbox.ts - RLM Environment Core
 * Feature #1: RLM Environment Core
 * Test IDs: env-init, env-execute, env-timeout
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  createEnvironment,
  type RlmEnvironment,
  type DocVariable,
  type SandboxOptions,
  TimeoutError,
  MemoryError,
} from '../../src/rlm/sandbox.js';

describe('sandbox.ts', () => {
  let env: RlmEnvironment | null = null;

  afterEach(() => {
    if (env) {
      env.dispose();
      env = null;
    }
  });

  describe('createEnvironment', () => {
    // Test ID: env-init
    describe('initializes environment with single doc', () => {
      it('should create environment with doc variable available', async () => {
        const doc: DocVariable = {
          content: '# Hello World\n\nThis is test content.',
          metadata: {
            path: 'test.md',
            size: 42,
            lines: 3,
            modified: '2026-01-22T00:00:00.000Z',
          },
          path: 'test.md',
        };

        env = await createEnvironment(doc);
        expect(env).toBeDefined();
        expect(typeof env.execute).toBe('function');
        expect(typeof env.dispose).toBe('function');
      });

      it('should expose doc.content', async () => {
        const doc: DocVariable = {
          content: 'Test content here',
          metadata: { path: 'test.md', size: 17, lines: 1, modified: '2026-01-22T00:00:00.000Z' },
          path: 'test.md',
        };

        env = await createEnvironment(doc);
        const result = await env.execute<string>('doc.content');
        expect(result.result).toBe('Test content here');
      });

      it('should expose doc.metadata', async () => {
        const doc: DocVariable = {
          content: 'Line 1\nLine 2\nLine 3',
          metadata: { path: 'test.md', size: 20, lines: 3, modified: '2026-01-22T10:00:00.000Z' },
          path: 'test.md',
        };

        env = await createEnvironment(doc);
        const result = await env.execute<{ path: string; lines: number }>('doc.metadata');
        expect(result.result.path).toBe('test.md');
        expect(result.result.lines).toBe(3);
      });

      it('should expose doc.path', async () => {
        const doc: DocVariable = {
          content: 'content',
          metadata: {
            path: 'research/notes.md',
            size: 7,
            lines: 1,
            modified: '2026-01-22T00:00:00.000Z',
          },
          path: 'research/notes.md',
        };

        env = await createEnvironment(doc);
        const result = await env.execute<string>('doc.path');
        expect(result.result).toBe('research/notes.md');
      });
    });

    describe('initializes environment with multiple docs', () => {
      it('should expose docs array when array provided', async () => {
        const docs: DocVariable[] = [
          {
            content: 'First doc',
            metadata: { path: 'first.md', size: 9, lines: 1, modified: '2026-01-22T00:00:00.000Z' },
            path: 'first.md',
          },
          {
            content: 'Second doc',
            metadata: {
              path: 'second.md',
              size: 10,
              lines: 1,
              modified: '2026-01-22T00:00:00.000Z',
            },
            path: 'second.md',
          },
        ];

        env = await createEnvironment(docs);
        const result = await env.execute<number>('docs.length');
        expect(result.result).toBe(2);
      });

      it('should allow accessing docs by index', async () => {
        const docs: DocVariable[] = [
          {
            content: 'First',
            metadata: { path: 'first.md', size: 5, lines: 1, modified: '2026-01-22T00:00:00.000Z' },
            path: 'first.md',
          },
          {
            content: 'Second',
            metadata: {
              path: 'second.md',
              size: 6,
              lines: 1,
              modified: '2026-01-22T00:00:00.000Z',
            },
            path: 'second.md',
          },
        ];

        env = await createEnvironment(docs);
        const result = await env.execute<string>('docs[1].content');
        expect(result.result).toBe('Second');
      });
    });
  });

  describe('execute', () => {
    // Test ID: env-execute
    describe('executes filter code', () => {
      it('should return filtered result', async () => {
        const doc: DocVariable = {
          content: '# Section 1\nContent\n# Section 2\nMore content',
          metadata: { path: 'test.md', size: 44, lines: 4, modified: '2026-01-22T00:00:00.000Z' },
          path: 'test.md',
        };

        env = await createEnvironment(doc);
        const result = await env.execute<string[]>(
          "doc.content.split('\\n').filter(l => l.startsWith('#'))"
        );
        expect(result.result).toEqual(['# Section 1', '# Section 2']);
      });

      it('should return execution time', async () => {
        const doc: DocVariable = {
          content: 'test',
          metadata: { path: 'test.md', size: 4, lines: 1, modified: '2026-01-22T00:00:00.000Z' },
          path: 'test.md',
        };

        env = await createEnvironment(doc);
        const result = await env.execute<string>('doc.content');
        expect(typeof result.executionTimeMs).toBe('number');
        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      });

      it('should handle complex transformations', async () => {
        const doc: DocVariable = {
          content: 'a,b,c\n1,2,3\n4,5,6',
          metadata: { path: 'data.csv', size: 17, lines: 3, modified: '2026-01-22T00:00:00.000Z' },
          path: 'data.csv',
        };

        env = await createEnvironment(doc);
        const result = await env.execute<string[][]>(
          "doc.content.split('\\n').map(l => l.split(','))"
        );
        expect(result.result).toEqual([
          ['a', 'b', 'c'],
          ['1', '2', '3'],
          ['4', '5', '6'],
        ]);
      });

      it('should handle JSON operations', async () => {
        const doc: DocVariable = {
          content: '{"name": "test", "count": 42}',
          metadata: { path: 'test.json', size: 29, lines: 1, modified: '2026-01-22T00:00:00.000Z' },
          path: 'test.json',
        };

        env = await createEnvironment(doc);
        const result = await env.execute<{ name: string }>('JSON.parse(doc.content)');
        expect(result.result.name).toBe('test');
      });
    });

    describe('throws on execution errors', () => {
      it('should throw on syntax error', async () => {
        const doc: DocVariable = {
          content: 'test',
          metadata: { path: 'test.md', size: 4, lines: 1, modified: '2026-01-22T00:00:00.000Z' },
          path: 'test.md',
        };

        env = await createEnvironment(doc);
        await expect(env.execute('const { = bad')).rejects.toThrow();
      });

      it('should throw on undefined variable access', async () => {
        const doc: DocVariable = {
          content: 'test',
          metadata: { path: 'test.md', size: 4, lines: 1, modified: '2026-01-22T00:00:00.000Z' },
          path: 'test.md',
        };

        env = await createEnvironment(doc);
        await expect(env.execute('undefinedVariable.something')).rejects.toThrow();
      });
    });
  });

  describe('timeout enforcement', () => {
    // Test ID: env-timeout
    it('should timeout on infinite loop', async () => {
      const doc: DocVariable = {
        content: 'test',
        metadata: { path: 'test.md', size: 4, lines: 1, modified: '2026-01-22T00:00:00.000Z' },
        path: 'test.md',
      };

      const options: SandboxOptions = { timeout: 100 }; // 100ms for faster test
      env = await createEnvironment(doc, options);

      await expect(env.execute('while(true) {}')).rejects.toThrow(TimeoutError);
    });

    it('should respect custom timeout', async () => {
      const doc: DocVariable = {
        content: 'test',
        metadata: { path: 'test.md', size: 4, lines: 1, modified: '2026-01-22T00:00:00.000Z' },
        path: 'test.md',
      };

      const options: SandboxOptions = { timeout: 50 };
      env = await createEnvironment(doc, options);

      const start = Date.now();
      await expect(env.execute('while(true) {}')).rejects.toThrow(TimeoutError);
      const elapsed = Date.now() - start;

      // Should timeout within reasonable range
      expect(elapsed).toBeLessThan(500);
    });

    it('should default timeout to 5000ms', async () => {
      const doc: DocVariable = {
        content: 'test',
        metadata: { path: 'test.md', size: 4, lines: 1, modified: '2026-01-22T00:00:00.000Z' },
        path: 'test.md',
      };

      // No options - should use default
      env = await createEnvironment(doc);

      // Quick execution should work fine
      const result = await env.execute<string>('doc.content');
      expect(result.result).toBe('test');
    });
  });

  describe('memory limit enforcement', () => {
    it('should throw MemoryError when memory limit exceeded', async () => {
      const doc: DocVariable = {
        content: 'test',
        metadata: { path: 'test.md', size: 4, lines: 1, modified: '2026-01-22T00:00:00.000Z' },
        path: 'test.md',
      };

      const options: SandboxOptions = { memoryLimit: 1 }; // 1MB very low limit
      env = await createEnvironment(doc, options);

      // Try to allocate a large array
      await expect(
        env.execute('const arr = []; for(let i = 0; i < 10000000; i++) arr.push(i); arr.length')
      ).rejects.toThrow(MemoryError);
    });
  });

  describe('dispose', () => {
    it('should clean up resources', async () => {
      const doc: DocVariable = {
        content: 'test',
        metadata: { path: 'test.md', size: 4, lines: 1, modified: '2026-01-22T00:00:00.000Z' },
        path: 'test.md',
      };

      env = await createEnvironment(doc);

      // Should work before dispose
      const result = await env.execute<string>('doc.content');
      expect(result.result).toBe('test');

      // Dispose
      env.dispose();

      // After dispose, execution should fail
      await expect(env.execute('doc.content')).rejects.toThrow();

      // Set to null so afterEach doesn't try to dispose again
      env = null;
    });

    it('should be safe to call multiple times', async () => {
      const doc: DocVariable = {
        content: 'test',
        metadata: { path: 'test.md', size: 4, lines: 1, modified: '2026-01-22T00:00:00.000Z' },
        path: 'test.md',
      };

      env = await createEnvironment(doc);
      env.dispose();

      // Should not throw when called again
      expect(() => env!.dispose()).not.toThrow();

      env = null;
    });
  });
});
