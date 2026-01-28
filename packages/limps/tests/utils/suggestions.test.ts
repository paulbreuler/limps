import { describe, it, expect } from 'vitest';
import { levenshteinDistance, findSimilar } from '../../src/utils/suggestions.js';

describe('suggestions', () => {
  describe('levenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
      expect(levenshteinDistance('', '')).toBe(0);
    });

    it('returns length of other string when one is empty', () => {
      expect(levenshteinDistance('', 'hello')).toBe(5);
      expect(levenshteinDistance('world', '')).toBe(5);
    });

    it('counts single character difference', () => {
      expect(levenshteinDistance('cat', 'bat')).toBe(1); // substitution
      expect(levenshteinDistance('cat', 'cats')).toBe(1); // insertion
      expect(levenshteinDistance('cats', 'cat')).toBe(1); // deletion
    });

    it('handles multiple edits', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(levenshteinDistance('saturday', 'sunday')).toBe(3);
    });

    it('is symmetric', () => {
      expect(levenshteinDistance('abc', 'xyz')).toBe(levenshteinDistance('xyz', 'abc'));
    });

    it('handles case-sensitive comparison', () => {
      expect(levenshteinDistance('Hello', 'hello')).toBe(1);
      expect(levenshteinDistance('WORLD', 'world')).toBe(5);
    });
  });

  describe('findSimilar', () => {
    const candidates = ['status', 'start', 'stats', 'stop', 'list-plans', 'list-agents'];

    it('finds similar strings sorted by distance', () => {
      const result = findSimilar('statsu', candidates);

      expect(result).toContain('status');
      expect(result).toContain('stats');
      // 'stats' (distance 1: remove 'u') should come before 'status' (distance 2: swap us)
      expect(result.indexOf('stats')).toBeLessThan(result.indexOf('status'));
    });

    it('excludes exact matches', () => {
      const result = findSimilar('status', candidates);

      expect(result).not.toContain('status');
    });

    it('respects maxDistance option', () => {
      const result = findSimilar('xyz', candidates, { maxDistance: 1 });

      expect(result).toHaveLength(0);
    });

    it('respects limit option', () => {
      const result = findSimilar('s', candidates, { maxDistance: 10, limit: 2 });

      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('performs case-insensitive matching', () => {
      const result = findSimilar('STATUS', candidates);

      expect(result).toContain('stats');
      expect(result).toContain('start');
    });

    it('returns empty array when no matches within distance', () => {
      const result = findSimilar('zzzzzzzzz', candidates, { maxDistance: 2 });

      expect(result).toEqual([]);
    });

    it('handles empty candidates', () => {
      const result = findSimilar('test', []);

      expect(result).toEqual([]);
    });

    it('uses default maxDistance of 3', () => {
      // 'stop' is distance 4 from 'status', should be excluded
      const result = findSimilar('status', ['stop', 'stats']);

      expect(result).toContain('stats'); // distance 2
      expect(result).not.toContain('stop'); // distance 4
    });

    it('uses default limit of 5', () => {
      const manyCandidates = Array.from({ length: 10 }, (_, i) => `item${i}`);
      const result = findSimilar('item', manyCandidates, { maxDistance: 5 });

      expect(result.length).toBeLessThanOrEqual(5);
    });
  });
});
