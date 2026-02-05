import type { Entity } from '../graph/types.js';
import type { GraphStorage } from '../graph/storage.js';
import type { BFSNode, GraphExpansionConfig } from './types.js';

/**
 * Perform BFS expansion from seed entities up to maxDepth hops.
 * Returns nodes with depth tracking, avoiding cycles.
 *
 * @param storage - Graph storage to traverse
 * @param seeds - Starting canonical IDs for traversal
 * @param config - Graph expansion configuration
 * @param limit - Maximum number of results to return
 * @returns Array of BFS nodes with depth information
 */
export function bfsExpansion(
  storage: GraphStorage,
  seeds: string[],
  config: GraphExpansionConfig,
  limit: number
): BFSNode[] {
  if (seeds.length === 0) {
    return [];
  }

  const visited = new Set<string>();
  const results: BFSNode[] = [];
  const queue: BFSNode[] = [];

  // Initialize queue with seed entities at depth 0
  for (const seedId of seeds) {
    const entity = storage.getEntity(seedId);
    if (entity) {
      visited.add(entity.canonicalId);
      queue.push({ entity, depth: 0 });
    }
  }

  let head = 0;
  while (head < queue.length && results.length < limit) {
    const current = queue[head++];
    if (!current) {
      continue;
    }

    // Don't expand beyond maxDepth
    if (current.depth >= config.maxDepth) {
      continue;
    }

    // Get neighbors and add to queue
    const neighbors = storage.getNeighbors(current.entity.id);
    for (const neighbor of neighbors) {
      // Skip if already visited (cycle detection)
      if (visited.has(neighbor.canonicalId)) {
        continue;
      }

      visited.add(neighbor.canonicalId);
      const node: BFSNode = {
        entity: neighbor,
        depth: current.depth + 1,
      };

      results.push(node);
      queue.push(node);

      // Early termination if we've reached the limit
      if (results.length >= limit) {
        return results;
      }
    }
  }

  return results;
}

/**
 * Score BFS nodes by hop distance using exponential decay.
 * Closer nodes receive higher scores.
 *
 * @param nodes - BFS nodes to score
 * @param hopDecay - Decay factor per hop (0.5 = halve score each hop)
 * @returns Entities with hop-distance scores
 */
export function scoreByHopDistance(
  nodes: BFSNode[],
  hopDecay: number
): { entity: Entity; score: number }[] {
  return nodes.map((node) => ({
    entity: node.entity,
    score: Math.pow(hopDecay, node.depth),
  }));
}
