/**
 * Tests for parallel execution utilities.
 * Test IDs: sub-parallel (part of)
 */

import { describe, it, expect } from 'vitest';
import { parallelMap } from '../../src/rlm/parallel.js';

describe('parallel', () => {
  describe('parallelMap', () => {
    it('should run items concurrently', async () => {
      const items = [1, 2, 3, 4, 5];
      const startTime = Date.now();

      const results = await parallelMap(
        items,
        async (item) => {
          // Simulate async work
          await new Promise((resolve) => setTimeout(resolve, 100));
          return item * 2;
        },
        { concurrency: 5 }
      );

      const duration = Date.now() - startTime;

      // With concurrency 5, all 5 items should run in parallel
      // Total time should be ~100ms, not ~500ms
      expect(duration).toBeLessThan(200); // Allow some overhead

      expect(results).toHaveLength(5);
      expect(results[0]).toEqual({ success: true, value: 2 });
      expect(results[1]).toEqual({ success: true, value: 4 });
      expect(results[2]).toEqual({ success: true, value: 6 });
      expect(results[3]).toEqual({ success: true, value: 8 });
      expect(results[4]).toEqual({ success: true, value: 10 });
    });

    it('should respect concurrency limit', async () => {
      const items = Array.from({ length: 10 }, (_, i) => i);
      const startTime = Date.now();
      const activeCounts: number[] = [];
      let active = 0;

      const results = await parallelMap(
        items,
        async (item) => {
          active++;
          activeCounts.push(active);
          // Simulate async work
          await new Promise((resolve) => setTimeout(resolve, 50));
          active--;
          return item;
        },
        { concurrency: 2 }
      );

      const duration = Date.now() - startTime;

      // With concurrency 2, 10 items should take ~5 batches * 50ms = ~250ms
      expect(duration).toBeGreaterThan(200);
      expect(duration).toBeLessThan(400);

      // Active count should never exceed concurrency limit
      const maxActive = Math.max(...activeCounts);
      expect(maxActive).toBeLessThanOrEqual(2);

      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toBe(index);
        }
      });
    });

    it('should isolate failures', async () => {
      const items = [1, 2, 3, 4, 5];

      const results = await parallelMap(
        items,
        async (item) => {
          if (item === 3) {
            throw new Error('Item 3 failed');
          }
          return item * 2;
        },
        { concurrency: 5 }
      );

      expect(results).toHaveLength(5);
      expect(results[0]).toEqual({ success: true, value: 2 });
      expect(results[1]).toEqual({ success: true, value: 4 });
      expect(results[2]).toEqual({ success: false, error: 'Item 3 failed' });
      expect(results[3]).toEqual({ success: true, value: 8 });
      expect(results[4]).toEqual({ success: true, value: 10 });
    });

    it('should apply per-item timeout', async () => {
      const items = [1, 2, 3];

      const results = await parallelMap(
        items,
        async (item) => {
          if (item === 2) {
            // This item will timeout
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
          return item;
        },
        { concurrency: 3, timeout: 100 }
      );

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ success: true, value: 1 });
      expect(results[1]).toEqual({
        success: false,
        error: expect.stringContaining('timed out'),
      });
      expect(results[2]).toEqual({ success: true, value: 3 });
    });

    it('should preserve order', async () => {
      const items = [5, 1, 4, 2, 3];

      const results = await parallelMap(
        items,
        async (item) => {
          // Simulate variable processing time
          await new Promise((resolve) => setTimeout(resolve, item * 10));
          return item * 10;
        },
        { concurrency: 5 }
      );

      expect(results).toHaveLength(5);
      // Results should be in input order, not completion order
      expect(results[0]).toEqual({ success: true, value: 50 });
      expect(results[1]).toEqual({ success: true, value: 10 });
      expect(results[2]).toEqual({ success: true, value: 40 });
      expect(results[3]).toEqual({ success: true, value: 20 });
      expect(results[4]).toEqual({ success: true, value: 30 });
    });

    it('should handle empty array', async () => {
      const results = await parallelMap([], async () => 1, { concurrency: 5 });

      expect(results).toEqual([]);
    });

    it('should handle single item', async () => {
      const results = await parallelMap([42], async (item) => item * 2, { concurrency: 5 });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ success: true, value: 84 });
    });

    it('should handle non-Error exceptions', async () => {
      const items = [1, 2];

      const results = await parallelMap(
        items,
        async (item) => {
          if (item === 2) {
            throw 'String error';
          }
          return item;
        },
        { concurrency: 2 }
      );

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ success: true, value: 1 });
      expect(results[1]).toEqual({ success: false, error: 'String error' });
    });
  });
});
