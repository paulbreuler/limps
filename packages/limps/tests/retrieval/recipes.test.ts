import { describe, it, expect } from 'vitest';
import {
  getRecipe,
  validateRecipe,
  listRecipes,
  BUILT_IN_RECIPES,
} from '../../src/retrieval/recipes.js';
import type { SearchRecipe } from '../../src/retrieval/types.js';

describe('Recipe Validation', () => {
  it('validates recipe with correct weights', () => {
    const recipe: SearchRecipe = {
      name: 'TEST',
      description: 'Test recipe',
      weights: { lexical: 0.5, semantic: 0.3, graph: 0.2 },
    };

    expect(() => validateRecipe(recipe)).not.toThrow();
  });

  it('throws error when weights do not sum to 1.0', () => {
    const recipe: SearchRecipe = {
      name: 'INVALID',
      description: 'Invalid recipe',
      weights: { lexical: 0.5, semantic: 0.3, graph: 0.3 }, // sums to 1.1
    };

    expect(() => validateRecipe(recipe)).toThrow(/must sum to 1\.0/);
  });

  it('throws error when weights sum to less than 1.0', () => {
    const recipe: SearchRecipe = {
      name: 'INVALID',
      description: 'Invalid recipe',
      weights: { lexical: 0.3, semantic: 0.2, graph: 0.2 }, // sums to 0.7
    };

    expect(() => validateRecipe(recipe)).toThrow(/must sum to 1\.0/);
  });

  it('allows floating point tolerance for weight sum', () => {
    const recipe: SearchRecipe = {
      name: 'FLOAT_TEST',
      description: 'Floating point test',
      weights: { lexical: 0.333333, semantic: 0.333333, graph: 0.333334 }, // close to 1.0
    };

    expect(() => validateRecipe(recipe)).not.toThrow();
  });

  it('throws error when depth exceeds maximum', () => {
    const recipe: SearchRecipe = {
      name: 'DEEP',
      description: 'Too deep',
      weights: { lexical: 0.5, semantic: 0.3, graph: 0.2 },
      graphConfig: { maxDepth: 15, hopDecay: 0.5 },
    };

    expect(() => validateRecipe(recipe)).toThrow(/maxDepth cannot exceed 10/);
  });

  it('throws error when depth is less than 1', () => {
    const recipe: SearchRecipe = {
      name: 'SHALLOW',
      description: 'Too shallow',
      weights: { lexical: 0.5, semantic: 0.3, graph: 0.2 },
      graphConfig: { maxDepth: 0, hopDecay: 0.5 },
    };

    expect(() => validateRecipe(recipe)).toThrow(/maxDepth must be at least 1/);
  });

  it('throws error when hopDecay is too low', () => {
    const recipe: SearchRecipe = {
      name: 'LOW_DECAY',
      description: 'Decay too low',
      weights: { lexical: 0.5, semantic: 0.3, graph: 0.2 },
      graphConfig: { maxDepth: 2, hopDecay: 0.05 },
    };

    expect(() => validateRecipe(recipe)).toThrow(/hopDecay must be between 0\.1 and 1\.0/);
  });

  it('throws error when hopDecay is too high', () => {
    const recipe: SearchRecipe = {
      name: 'HIGH_DECAY',
      description: 'Decay too high',
      weights: { lexical: 0.5, semantic: 0.3, graph: 0.2 },
      graphConfig: { maxDepth: 2, hopDecay: 1.5 },
    };

    expect(() => validateRecipe(recipe)).toThrow(/hopDecay must be between 0\.1 and 1\.0/);
  });

  it('throws error when similarityThreshold is out of range', () => {
    const recipe: SearchRecipe = {
      name: 'BAD_THRESHOLD',
      description: 'Invalid threshold',
      weights: { lexical: 0.5, semantic: 0.3, graph: 0.2 },
      similarityThreshold: 1.5,
    };

    expect(() => validateRecipe(recipe)).toThrow(/similarityThreshold must be between 0 and 1/);
  });

  it('throws error when similarityThreshold is negative', () => {
    const recipe: SearchRecipe = {
      name: 'BAD_THRESHOLD',
      description: 'Invalid threshold',
      weights: { lexical: 0.5, semantic: 0.3, graph: 0.2 },
      similarityThreshold: -0.1,
    };

    expect(() => validateRecipe(recipe)).toThrow(/similarityThreshold must be between 0 and 1/);
  });

  it('accepts valid recipe with graphConfig', () => {
    const recipe: SearchRecipe = {
      name: 'VALID_GRAPH',
      description: 'Valid with graph config',
      weights: { lexical: 0.2, semantic: 0.3, graph: 0.5 },
      graphConfig: {
        maxDepth: 3,
        hopDecay: 0.5,
      },
      similarityThreshold: 0.7,
    };

    expect(() => validateRecipe(recipe)).not.toThrow();
  });

  it('accepts recipe without graphConfig', () => {
    const recipe: SearchRecipe = {
      name: 'NO_GRAPH',
      description: 'No graph config',
      weights: { lexical: 0.6, semantic: 0.4, graph: 0.0 },
    };

    expect(() => validateRecipe(recipe)).not.toThrow();
  });
});

describe('Built-in Recipes', () => {
  it('has EDGE_HYBRID_RRF recipe', () => {
    const recipe = getRecipe('EDGE_HYBRID_RRF');
    expect(recipe.name).toBe('EDGE_HYBRID_RRF');
    expect(recipe.weights.graph).toBeGreaterThan(recipe.weights.semantic);
    expect(recipe.graphConfig?.maxDepth).toBe(1);
  });

  it('has NODE_HYBRID_RRF recipe', () => {
    const recipe = getRecipe('NODE_HYBRID_RRF');
    expect(recipe.name).toBe('NODE_HYBRID_RRF');
    expect(recipe.weights.semantic).toBeGreaterThanOrEqual(recipe.weights.graph);
    expect(recipe.graphConfig?.maxDepth).toBe(1);
  });

  it('has BFS_EXPANSION recipe', () => {
    const recipe = getRecipe('BFS_EXPANSION');
    expect(recipe.name).toBe('BFS_EXPANSION');
    expect(recipe.weights.graph).toBeGreaterThan(0);
    expect(recipe.graphConfig?.maxDepth).toBeGreaterThanOrEqual(3);
    expect(recipe.graphConfig?.hopDecay).toBeLessThan(1.0);
  });

  it('has LEXICAL_FIRST recipe', () => {
    const recipe = getRecipe('LEXICAL_FIRST');
    expect(recipe.name).toBe('LEXICAL_FIRST');
    expect(recipe.weights.lexical).toBeGreaterThan(recipe.weights.semantic);
    expect(recipe.weights.lexical).toBeGreaterThan(recipe.weights.graph);
  });

  it('has SEMANTIC_FIRST recipe', () => {
    const recipe = getRecipe('SEMANTIC_FIRST');
    expect(recipe.name).toBe('SEMANTIC_FIRST');
    expect(recipe.weights.semantic).toBeGreaterThan(recipe.weights.lexical);
    expect(recipe.weights.semantic).toBeGreaterThan(recipe.weights.graph);
  });

  it('has HYBRID_BALANCED recipe', () => {
    const recipe = getRecipe('HYBRID_BALANCED');
    expect(recipe.name).toBe('HYBRID_BALANCED');
    expect(recipe.graphConfig?.maxDepth).toBe(2);
    // Balanced means all weights are relatively similar
    const { lexical, semantic, graph } = recipe.weights;
    expect(Math.max(lexical, semantic, graph) - Math.min(lexical, semantic, graph)).toBeLessThan(
      0.2
    );
  });

  it('all built-in recipes are valid', () => {
    for (const recipe of Object.values(BUILT_IN_RECIPES)) {
      expect(() => validateRecipe(recipe)).not.toThrow();
    }
  });

  it('all built-in recipes have unique names', () => {
    const names = Object.values(BUILT_IN_RECIPES).map((r) => r.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('has exactly 6 built-in recipes', () => {
    const recipes = Object.values(BUILT_IN_RECIPES);
    expect(recipes).toHaveLength(6);
  });
});

describe('Recipe Lookup', () => {
  it('retrieves recipe by name', () => {
    const recipe = getRecipe('LEXICAL_FIRST');
    expect(recipe.name).toBe('LEXICAL_FIRST');
  });

  it('throws error for unknown recipe name', () => {
    expect(() => getRecipe('NONEXISTENT')).toThrow(/Unknown recipe: NONEXISTENT/);
  });

  it('is case-sensitive', () => {
    expect(() => getRecipe('lexical_first')).toThrow();
  });

  it('lists all recipe names', () => {
    const names = listRecipes();
    expect(names).toContain('EDGE_HYBRID_RRF');
    expect(names).toContain('NODE_HYBRID_RRF');
    expect(names).toContain('BFS_EXPANSION');
    expect(names).toContain('LEXICAL_FIRST');
    expect(names).toContain('SEMANTIC_FIRST');
    expect(names).toContain('HYBRID_BALANCED');
    expect(names).toHaveLength(6);
  });
});

describe('Recipe Immutability', () => {
  it('does not allow modification of returned recipe', () => {
    const recipe = getRecipe('LEXICAL_FIRST');
    const originalWeight = recipe.weights.lexical;

    // Try to modify (should not affect future lookups)
    (recipe.weights as any).lexical = 0.99;

    const recipe2 = getRecipe('LEXICAL_FIRST');
    expect(recipe2.weights.lexical).toBe(originalWeight);
  });
});
