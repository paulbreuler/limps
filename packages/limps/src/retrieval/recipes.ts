import type { SearchRecipe } from './types.js';
import { RECIPE_CONSTRAINTS } from './types.js';

/**
 * Built-in search recipes inspired by Graphiti's retrieval strategies.
 */
export const BUILT_IN_RECIPES: Record<string, SearchRecipe> = {
  /**
   * Graph-first with semantic fallback (1-hop).
   * Best for: Relationship queries, dependency tracking.
   * Example: "what blocks agent 003"
   */
  EDGE_HYBRID_RRF: {
    name: 'EDGE_HYBRID_RRF',
    description: 'Graph-first with semantic fallback for relationship queries',
    weights: { lexical: 0.2, semantic: 0.3, graph: 0.5 },
    graphConfig: { maxDepth: 1, hopDecay: 0.5 },
  },

  /**
   * Semantic-first with graph support (1-hop).
   * Best for: Conceptual queries with entity context.
   * Example: "explain authentication in plan 42"
   */
  NODE_HYBRID_RRF: {
    name: 'NODE_HYBRID_RRF',
    description: 'Semantic-first with graph support for conceptual queries',
    weights: { lexical: 0.2, semantic: 0.5, graph: 0.3 },
    graphConfig: { maxDepth: 1, hopDecay: 0.5, similarityThreshold: 0.6 },
  },

  /**
   * Deep graph traversal (3-hop with hop decay).
   * Best for: Impact analysis, transitive dependencies.
   * Example: "trace dependencies of plan 41"
   */
  BFS_EXPANSION: {
    name: 'BFS_EXPANSION',
    description: 'Deep multi-hop graph traversal for impact analysis',
    weights: { lexical: 0.1, semantic: 0.2, graph: 0.7 },
    graphConfig: { maxDepth: 3, hopDecay: 0.5 },
  },

  /**
   * Lexical-first for exact entity lookups.
   * Best for: Direct entity references by ID.
   * Example: "plan 0042", "agent #003"
   */
  LEXICAL_FIRST: {
    name: 'LEXICAL_FIRST',
    description: 'Exact entity lookups by ID or name',
    weights: { lexical: 0.6, semantic: 0.2, graph: 0.2 },
    graphConfig: { maxDepth: 1, hopDecay: 0.5 },
  },

  /**
   * Semantic-first for conceptual queries.
   * Best for: Understanding concepts, exploring similar ideas.
   * Example: "how does authentication work"
   */
  SEMANTIC_FIRST: {
    name: 'SEMANTIC_FIRST',
    description: 'Conceptual exploration via embeddings',
    weights: { lexical: 0.2, semantic: 0.6, graph: 0.2 },
    graphConfig: { maxDepth: 1, hopDecay: 0.5, similarityThreshold: 0.7 },
  },

  /**
   * Balanced 3-way fusion with 2-hop expansion.
   * Best for: Ambiguous or exploratory queries.
   * Example: "search something"
   */
  HYBRID_BALANCED: {
    name: 'HYBRID_BALANCED',
    description: 'Balanced fusion for exploratory queries',
    weights: { lexical: 0.33, semantic: 0.34, graph: 0.33 },
    graphConfig: { maxDepth: 2, hopDecay: 0.6 },
  },
};

/**
 * Validate a search recipe's parameters.
 * @throws Error if recipe is invalid
 */
export function validateRecipe(recipe: SearchRecipe): void {
  // Validate weight sum (with floating point tolerance)
  const weightSum = recipe.weights.lexical + recipe.weights.semantic + recipe.weights.graph;
  if (Math.abs(weightSum - 1.0) > RECIPE_CONSTRAINTS.WEIGHT_SUM_TOLERANCE) {
    throw new Error(
      `Recipe "${recipe.name}": weights must sum to 1.0 (got ${weightSum.toFixed(3)})`
    );
  }

  // Validate graph config if present
  if (recipe.graphConfig) {
    const { maxDepth, hopDecay, similarityThreshold } = recipe.graphConfig;

    if (maxDepth < 1) {
      throw new Error(`Recipe "${recipe.name}": maxDepth must be at least 1 (got ${maxDepth})`);
    }

    if (maxDepth > RECIPE_CONSTRAINTS.MAX_DEPTH) {
      throw new Error(
        `Recipe "${recipe.name}": maxDepth cannot exceed ${RECIPE_CONSTRAINTS.MAX_DEPTH} (got ${maxDepth})`
      );
    }

    if (
      hopDecay < RECIPE_CONSTRAINTS.MIN_HOP_DECAY ||
      hopDecay > RECIPE_CONSTRAINTS.MAX_HOP_DECAY
    ) {
      throw new Error(
        `Recipe "${recipe.name}": hopDecay must be between ${RECIPE_CONSTRAINTS.MIN_HOP_DECAY.toFixed(1)} and ${RECIPE_CONSTRAINTS.MAX_HOP_DECAY.toFixed(1)} (got ${hopDecay})`
      );
    }

    if (similarityThreshold !== undefined && (similarityThreshold < 0 || similarityThreshold > 1)) {
      throw new Error(
        `Recipe "${recipe.name}": similarityThreshold must be between 0 and 1 (got ${similarityThreshold})`
      );
    }
  }
}

/**
 * Retrieve a recipe by name.
 * @throws Error if recipe not found
 */
export function getRecipe(name: string): SearchRecipe {
  const recipe = BUILT_IN_RECIPES[name];
  if (!recipe) {
    throw new Error(`Unknown recipe: ${name}`);
  }
  // Return a deep copy to prevent modification
  return JSON.parse(JSON.stringify(recipe));
}

/**
 * List all available recipe names.
 */
export function listRecipes(): string[] {
  return Object.keys(BUILT_IN_RECIPES);
}
