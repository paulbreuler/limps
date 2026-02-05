import { describe, expect, it } from 'vitest';
import { routeQuery } from '../../src/retrieval/router.js';
import { rrf, type RankedItem } from '../../src/retrieval/rrf.js';

describe('Deterministic Router', () => {
  it('routes "plan 0042" to LEXICAL_FIRST recipe', () => {
    const recipe = routeQuery('plan 0042');
    expect(recipe.name).toBe('LEXICAL_FIRST');
    expect(recipe.weights.lexical).toBeGreaterThan(recipe.weights.semantic);
  });

  it('routes "what blocks agent 003" to EDGE_HYBRID_RRF recipe', () => {
    const recipe = routeQuery('what blocks agent 003');
    expect(recipe.name).toBe('EDGE_HYBRID_RRF');
    expect(recipe.weights.graph).toBeGreaterThanOrEqual(recipe.weights.semantic);
  });

  it('routes "explain authentication" to SEMANTIC_FIRST recipe', () => {
    const recipe = routeQuery('explain authentication');
    expect(recipe.name).toBe('SEMANTIC_FIRST');
    expect(recipe.weights.semantic).toBeGreaterThan(recipe.weights.lexical);
  });

  it('routes "status of plan 41" to EDGE_HYBRID_RRF recipe', () => {
    const recipe = routeQuery('status of plan 41');
    expect(recipe.name).toBe('EDGE_HYBRID_RRF');
    expect(recipe.weights.graph).toBeGreaterThanOrEqual(recipe.weights.lexical);
  });
});

describe('RRF Fusion', () => {
  it('combines rankings with correct weights', () => {
    const rankings = new Map<string, RankedItem[]>([
      [
        'lexical',
        [
          { id: 'A', score: 1, source: 'lexical' },
          { id: 'B', score: 0.8, source: 'lexical' },
        ],
      ],
      [
        'semantic',
        [
          { id: 'B', score: 1, source: 'semantic' },
          { id: 'C', score: 0.9, source: 'semantic' },
        ],
      ],
    ]);

    const result = rrf(rankings, { lexical: 0.8, semantic: 0.2, graph: 0 }, 10);

    // B appears in both lists (ranks 1 and 0), should win with correct RRF formula
    // A: 0.8 * 1/(10+0+1) = 0.0727
    // B: 0.8 * 1/(10+1+1) + 0.2 * 1/(10+0+1) = 0.0667 + 0.0182 = 0.0849
    // C: 0.2 * 1/(10+1+1) = 0.0167
    expect(result[0]?.id).toBe('B');
  });

  it('handles items appearing in multiple lists', () => {
    const rankings = new Map<string, RankedItem[]>([
      [
        'lexical',
        [
          { id: 'X', score: 1, source: 'lexical' },
          { id: 'Y', score: 1, source: 'lexical' },
        ],
      ],
      [
        'graph',
        [
          { id: 'Y', score: 1, source: 'graph' },
          { id: 'Z', score: 1, source: 'graph' },
        ],
      ],
    ]);

    const result = rrf(rankings, { lexical: 0.5, semantic: 0, graph: 0.5 }, 60);
    expect(result[0]?.id).toBe('Y');
  });

  it('produces deterministic output for same input', () => {
    const rankings = new Map<string, RankedItem[]>([
      ['lexical', [{ id: 'A', score: 1, source: 'lexical' }]],
      ['semantic', [{ id: 'B', score: 1, source: 'semantic' }]],
      ['graph', [{ id: 'C', score: 1, source: 'graph' }]],
    ]);

    const one = rrf(rankings, { lexical: 0.4, semantic: 0.4, graph: 0.2 }, 60);
    const two = rrf(rankings, { lexical: 0.4, semantic: 0.4, graph: 0.2 }, 60);
    expect(one).toEqual(two);
  });
});
