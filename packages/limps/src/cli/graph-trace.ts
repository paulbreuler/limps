import type { Database as DatabaseType } from 'better-sqlite3';
import type { ServerConfig } from '../config.js';
import { GraphStorage } from '../graph/storage.js';
import type { Entity, Relationship } from '../graph/types.js';
import { LinkAnalyzer } from '../analysis/link-analysis.js';

export type GraphTraceMode = 'graph' | 'pagerank';

export interface GraphTraceOptions {
  direction?: 'up' | 'down' | 'both';
  depth?: number;
  mode?: GraphTraceMode;
}

export interface GraphTraceResult {
  root: Entity;
  neighbors: Entity[];
  paths: Entity[][] | null;
  relationships: Relationship[];
  direction: string;
  depth: number;
  mode: GraphTraceMode;
  pageRank?: {
    score: number;
    rank: number;
    totalEntities: number;
  };
}

export function graphTrace(
  _config: ServerConfig,
  db: DatabaseType,
  entityId: string,
  options?: GraphTraceOptions
): GraphTraceResult {
  const storage = new GraphStorage(db);
  const direction = options?.direction ?? 'both';
  const depth = options?.depth ?? 2;
  const mode = options?.mode ?? 'graph';

  const entity = storage.getEntity(entityId);
  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  const neighbors = storage.getNeighbors(entity.id);

  const relDirection = direction === 'up' ? 'incoming' : direction === 'down' ? 'outgoing' : 'both';
  const relationships = storage.getRelationships(entity.id, relDirection);

  // Try to find paths to connected entities
  let paths: Entity[][] | null = null;
  if (neighbors.length > 0 && depth > 1) {
    const firstNeighbor = neighbors[0];
    if (firstNeighbor) {
      paths = storage.getPath(entity.id, firstNeighbor.id, depth);
    }
  }

  const result: GraphTraceResult = {
    root: entity,
    neighbors,
    paths,
    relationships,
    direction,
    depth,
    mode,
  };

  // Compute PageRank if requested
  if (mode === 'pagerank') {
    const analyzer = new LinkAnalyzer(db);
    const fullRank = analyzer.computeFullPageRank();
    const score = fullRank.get(entity.canonicalId) ?? 0;

    // Compute rank position
    const sortedScores = Array.from(fullRank.values()).sort((a, b) => b - a);
    const rank = sortedScores.indexOf(score) + 1;

    result.pageRank = {
      score,
      rank,
      totalEntities: fullRank.size,
    };
  }

  return result;
}
