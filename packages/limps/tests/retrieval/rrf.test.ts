import { describe, it, expect } from 'vitest';
import { rrf, type RankedItem } from '../../src/retrieval/rrf.js';

describe('RRF Fusion', () => {
  it('combines rankings with correct weights', () => {
    const rankings = new Map<string, RankedItem[]>([
      [
        'lexical',
        [
          { id: 'doc1', score: 0.9, source: 'lexical' },
          { id: 'doc2', score: 0.8, source: 'lexical' },
          { id: 'doc3', score: 0.7, source: 'lexical' },
        ],
      ],
      [
        'semantic',
        [
          { id: 'doc2', score: 0.95, source: 'semantic' },
          { id: 'doc3', score: 0.85, source: 'semantic' },
          { id: 'doc1', score: 0.75, source: 'semantic' },
        ],
      ],
    ]);

    const weights = { lexical: 0.6, semantic: 0.4, graph: 0.0 };
    const k = 60;

    const result = rrf(rankings, weights, k);

    // doc2 appears in both lists at good ranks, should win
    expect(result[0].id).toBe('doc2');

    // All docs should have scores
    expect(result.every((item) => item.score > 0)).toBe(true);

    // Scores should be in descending order
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });

  it('handles items appearing in multiple lists', () => {
    const rankings = new Map<string, RankedItem[]>([
      ['lexical', [{ id: 'doc1', score: 0.9, source: 'lexical' }]],
      ['semantic', [{ id: 'doc1', score: 0.95, source: 'semantic' }]],
      ['graph', [{ id: 'doc1', score: 0.85, source: 'graph' }]],
    ]);

    const weights = { lexical: 1.0, semantic: 1.0, graph: 1.0 };
    const result = rrf(rankings, weights);

    // doc1 should appear only once with combined score
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('doc1');

    // Score should reflect all three sources (3 * 1/(60+0+1))
    const expectedScore = 3 * (1 / 61);
    expect(result[0].score).toBeCloseTo(expectedScore, 5);
  });

  it('produces deterministic output for same input', () => {
    const rankings = new Map<string, RankedItem[]>([
      [
        'lexical',
        [
          { id: 'doc1', score: 0.9, source: 'lexical' },
          { id: 'doc2', score: 0.8, source: 'lexical' },
        ],
      ],
      [
        'semantic',
        [
          { id: 'doc2', score: 0.95, source: 'semantic' },
          { id: 'doc1', score: 0.85, source: 'semantic' },
        ],
      ],
    ]);

    const weights = { lexical: 0.5, semantic: 0.5, graph: 0.0 };

    const result1 = rrf(rankings, weights);
    const result2 = rrf(rankings, weights);

    expect(result1).toEqual(result2);
  });

  it('applies correct RRF formula: weight * 1/(k + rank + 1)', () => {
    const rankings = new Map<string, RankedItem[]>([
      [
        'lexical',
        [
          { id: 'doc1', score: 0.9, source: 'lexical' }, // rank 0
        ],
      ],
    ]);

    const weights = { lexical: 2.0, semantic: 0.0, graph: 0.0 };
    const k = 60;

    const result = rrf(rankings, weights, k);

    // Expected: weight * 1/(k + rank + 1) = 2.0 * 1/(60 + 0 + 1) = 2.0/61
    const expectedScore = 2.0 / 61;
    expect(result[0].score).toBeCloseTo(expectedScore, 5);
  });

  it('does NOT multiply by original item.score', () => {
    // RRF is rank-based, not score-based
    // Original scores should not affect final RRF score

    const rankings = new Map<string, RankedItem[]>([
      [
        'lexical',
        [
          { id: 'doc1', score: 0.1, source: 'lexical' }, // Low score, rank 0
          { id: 'doc2', score: 0.9, source: 'lexical' }, // High score, rank 1
        ],
      ],
    ]);

    const weights = { lexical: 1.0, semantic: 0.0, graph: 0.0 };
    const k = 60;

    const result = rrf(rankings, weights, k);

    // doc1 has lower score but better rank, should win
    expect(result[0].id).toBe('doc1');

    // Verify scores are based on rank only
    const doc1Score = 1.0 / 61; // rank 0
    const doc2Score = 1.0 / 62; // rank 1

    expect(result[0].score).toBeCloseTo(doc1Score, 5);
    expect(result[1].score).toBeCloseTo(doc2Score, 5);
  });

  it('handles empty rankings gracefully', () => {
    const rankings = new Map<string, RankedItem[]>([
      ['lexical', []],
      ['semantic', []],
    ]);

    const weights = { lexical: 0.5, semantic: 0.5, graph: 0.0 };
    const result = rrf(rankings, weights);

    expect(result).toEqual([]);
  });

  it('handles single source', () => {
    const rankings = new Map<string, RankedItem[]>([
      [
        'lexical',
        [
          { id: 'doc1', score: 0.9, source: 'lexical' },
          { id: 'doc2', score: 0.8, source: 'lexical' },
        ],
      ],
    ]);

    const weights = { lexical: 1.0, semantic: 0.0, graph: 0.0 };
    const result = rrf(rankings, weights);

    expect(result.length).toBe(2);
    expect(result[0].id).toBe('doc1');
    expect(result[1].id).toBe('doc2');
  });
});
