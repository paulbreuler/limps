import { describe, it, expect } from 'vitest';
import { routeQuery } from '../../src/retrieval/router.js';

describe('Deterministic Router', () => {
  it('routes "plan 0042" to lexical-first', () => {
    const strategy = routeQuery('plan 0042');
    expect(strategy.primary).toBe('lexical');
    expect(strategy.weights.lexical).toBeGreaterThan(strategy.weights.semantic);
    expect(strategy.weights.lexical).toBeGreaterThan(strategy.weights.graph);
  });

  it('routes exact entity IDs to lexical-first', () => {
    const cases = ['agent #003', 'plan 0041', '0042-003', 'show plan 42'];

    for (const query of cases) {
      const strategy = routeQuery(query);
      expect(strategy.primary).toBe('lexical');
    }
  });

  it('routes "what blocks agent 003" to graph-first', () => {
    const strategy = routeQuery('what blocks agent 003');
    expect(strategy.primary).toBe('graph');
    expect(strategy.weights.graph).toBeGreaterThan(strategy.weights.lexical);
    expect(strategy.weights.graph).toBeGreaterThan(strategy.weights.semantic);
  });

  it('routes relational queries to graph-first', () => {
    const cases = [
      'what depends on plan 41',
      'show blocking issues',
      'what modifies auth.ts',
      'find related features',
      'check for contention',
    ];

    for (const query of cases) {
      const strategy = routeQuery(query);
      expect(strategy.primary).toBe('graph');
    }
  });

  it('routes "explain authentication" to semantic-first', () => {
    const strategy = routeQuery('explain authentication');
    expect(strategy.primary).toBe('semantic');
    expect(strategy.weights.semantic).toBeGreaterThan(strategy.weights.lexical);
    expect(strategy.weights.semantic).toBeGreaterThan(strategy.weights.graph);
  });

  it('routes conceptual queries to semantic-first', () => {
    const cases = [
      'how does auth work',
      'why was this added',
      'describe the feature',
      'similar to plan 41',
      'what is hybrid retrieval',
    ];

    for (const query of cases) {
      const strategy = routeQuery(query);
      expect(strategy.primary).toBe('semantic');
    }
  });

  it('routes "status of plan 41" to graph+lexical', () => {
    const strategy = routeQuery('status of plan 41');
    expect(strategy.primary).toBe('graph');
    expect(strategy.weights.graph).toBeGreaterThanOrEqual(strategy.weights.lexical);
  });

  it('routes status queries appropriately', () => {
    const cases = [
      'show progress',
      'what is blocked',
      'completion status',
      'wip agents',
      'gap tasks remaining',
    ];

    for (const query of cases) {
      const strategy = routeQuery(query);
      expect(strategy.primary).toBe('graph');
    }
  });

  it('routes file queries to lexical+graph', () => {
    const cases = ['files modified by plan 41', 'router.ts changes', 'what touches auth.md'];

    for (const query of cases) {
      const strategy = routeQuery(query);
      expect(strategy.primary).toBe('lexical');
    }
  });

  it('uses balanced hybrid for ambiguous queries', () => {
    const strategy = routeQuery('search something');
    expect(strategy.primary).toBe('hybrid');
    expect(strategy.weights.semantic).toBeGreaterThanOrEqual(0.3);
    expect(strategy.weights.lexical).toBeGreaterThanOrEqual(0.2);
    expect(strategy.weights.graph).toBeGreaterThanOrEqual(0.2);
  });

  it('checks exact patterns before relational patterns', () => {
    // "plan 0042 depends on" has both exact ID and relational keyword
    // Exact ID should take precedence (spec order: exact → relational)
    const strategy = routeQuery('plan 0042 depends on plan 0041');
    expect(strategy.primary).toBe('lexical');
  });
});
