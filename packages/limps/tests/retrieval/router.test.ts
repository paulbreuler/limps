import { describe, it, expect } from 'vitest';
import { routeQuery } from '../../src/retrieval/router.js';

describe('Deterministic Router', () => {
  it('routes "plan 0042" to LEXICAL_FIRST recipe', () => {
    const strategy = routeQuery('plan 0042');
    expect(strategy.name).toBe('LEXICAL_FIRST');
    expect(strategy.weights.lexical).toBeGreaterThan(strategy.weights.semantic);
    expect(strategy.weights.lexical).toBeGreaterThan(strategy.weights.graph);
  });

  it('routes exact entity IDs to LEXICAL_FIRST recipe', () => {
    const cases = ['agent #003', 'plan 0041', '0042-003', 'show plan 42'];

    for (const query of cases) {
      const strategy = routeQuery(query);
      expect(strategy.name).toBe('LEXICAL_FIRST');
    }
  });

  it('routes "what blocks agent 003" to EDGE_HYBRID_RRF recipe', () => {
    const strategy = routeQuery('what blocks agent 003');
    expect(strategy.name).toBe('EDGE_HYBRID_RRF');
    expect(strategy.weights.graph).toBeGreaterThan(strategy.weights.lexical);
    expect(strategy.weights.graph).toBeGreaterThan(strategy.weights.semantic);
  });

  it('routes relational queries to EDGE_HYBRID_RRF recipe', () => {
    const cases = [
      'what depends on plan 41',
      'show blocking issues',
      'what modifies auth.ts',
      'find related features',
      'check for contention',
    ];

    for (const query of cases) {
      const strategy = routeQuery(query);
      expect(strategy.name).toBe('EDGE_HYBRID_RRF');
    }
  });

  it('routes "explain authentication" to SEMANTIC_FIRST recipe', () => {
    const strategy = routeQuery('explain authentication');
    expect(strategy.name).toBe('SEMANTIC_FIRST');
    expect(strategy.weights.semantic).toBeGreaterThan(strategy.weights.lexical);
    expect(strategy.weights.semantic).toBeGreaterThan(strategy.weights.graph);
  });

  it('routes conceptual queries to SEMANTIC_FIRST recipe', () => {
    const cases = [
      'how does auth work',
      'why was this added',
      'describe the feature',
      'what is hybrid retrieval',
      'tell me about caching',
    ];

    for (const query of cases) {
      const strategy = routeQuery(query);
      expect(strategy.name).toBe('SEMANTIC_FIRST');
    }
  });

  it('routes "status of plan 41" to EDGE_HYBRID_RRF recipe', () => {
    const strategy = routeQuery('status of plan 41');
    expect(strategy.name).toBe('EDGE_HYBRID_RRF');
    expect(strategy.weights.graph).toBeGreaterThanOrEqual(strategy.weights.lexical);
  });

  it('routes status queries to EDGE_HYBRID_RRF recipe', () => {
    const cases = [
      'show progress',
      'what is blocked',
      'completion status',
      'wip agents',
      'gap tasks remaining',
    ];

    for (const query of cases) {
      const strategy = routeQuery(query);
      expect(strategy.name).toBe('EDGE_HYBRID_RRF');
    }
  });

  it('routes file queries to LEXICAL_FIRST recipe', () => {
    const cases = ['files modified by plan 41', 'router.ts changes', 'what touches auth.md'];

    for (const query of cases) {
      const strategy = routeQuery(query);
      expect(strategy.name).toBe('LEXICAL_FIRST');
    }
  });

  it('uses HYBRID_BALANCED recipe for ambiguous queries', () => {
    const strategy = routeQuery('search something');
    expect(strategy.name).toBe('HYBRID_BALANCED');
    expect(strategy.weights.semantic).toBeGreaterThanOrEqual(0.3);
    expect(strategy.weights.lexical).toBeGreaterThanOrEqual(0.2);
    expect(strategy.weights.graph).toBeGreaterThanOrEqual(0.2);
  });

  it('checks exact patterns before relational patterns', () => {
    // "plan 0042 depends on" has both exact ID and relational keyword
    // Exact ID should take precedence (spec order: exact → relational)
    const strategy = routeQuery('plan 0042 depends on plan 0041');
    expect(strategy.name).toBe('LEXICAL_FIRST');
  });

  it('returns valid recipe with all required fields', () => {
    const strategy = routeQuery('plan 0042');
    expect(strategy).toHaveProperty('name');
    expect(strategy).toHaveProperty('description');
    expect(strategy).toHaveProperty('weights');
    expect(strategy.weights).toHaveProperty('lexical');
    expect(strategy.weights).toHaveProperty('semantic');
    expect(strategy.weights).toHaveProperty('graph');
  });

  it('routes conceptual query with entity to NODE_HYBRID_RRF recipe', () => {
    const strategy = routeQuery('explain authentication in plan 42');
    expect(strategy.name).toBe('NODE_HYBRID_RRF');
  });
});
