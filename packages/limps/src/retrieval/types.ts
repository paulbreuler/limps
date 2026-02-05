import type { Entity } from '../graph/types.js';

/**
 * Source channel for retrieval results.
 */
export type RetrievalSource = 'lexical' | 'semantic' | 'graph';

/**
 * Maximum BFS queue size to prevent runaway traversals.
 */
export const BFS_QUEUE_LIMIT = 1000;

/**
 * Configuration for graph expansion during BFS traversal.
 */
export interface GraphExpansionConfig {
  /** Maximum depth to traverse (1-3 hops recommended, max 10 enforced) */
  maxDepth: number;
  /** Score decay per hop (0.5 = halve score each hop, range 0.1-1.0) */
  hopDecay: number;
}

/**
 * Node representation during BFS traversal with depth tracking.
 */
export interface BFSNode {
  /** The entity at this node */
  entity: Entity;
  /** Hop distance from seed nodes (0 = seed, 1 = direct neighbor, etc.) */
  depth: number;
}

/**
 * Pre-configured search strategy combining weights and graph expansion.
 */
export interface SearchRecipe {
  /** Unique identifier for the recipe */
  name: string;
  /** Human-readable description of when to use this recipe */
  description: string;
  /** Fusion weights for RRF (must sum to 1.0) */
  weights: {
    lexical: number;
    semantic: number;
    graph: number;
  };
  /** Optional graph expansion configuration */
  graphConfig?: GraphExpansionConfig;
  /** Optional minimum similarity threshold for semantic results (0-1) */
  similarityThreshold?: number;
}

/**
 * Validation constraints for recipe parameters.
 */
export const RECIPE_CONSTRAINTS = {
  /** Maximum allowed depth for BFS traversal */
  MAX_DEPTH: 10,
  /** Minimum hop decay factor */
  MIN_HOP_DECAY: 0.1,
  /** Maximum hop decay factor */
  MAX_HOP_DECAY: 1.0,
  /** Tolerance for weight sum validation (to handle floating point) */
  WEIGHT_SUM_TOLERANCE: 0.001,
} as const;
