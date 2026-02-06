import type { Database as DatabaseType } from 'better-sqlite3';
import type { ServerConfig } from '../config.js';
import { GraphStorage } from '../graph/storage.js';
import type { Entity, Relationship } from '../graph/types.js';

export interface GraphTraceOptions {
  direction?: 'up' | 'down' | 'both';
  depth?: number;
}

export interface GraphTraceResult {
  root: Entity;
  neighbors: Entity[];
  paths: Entity[][] | null;
  relationships: Relationship[];
  direction: string;
  depth: number;
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

  return {
    root: entity,
    neighbors,
    paths,
    relationships,
    direction,
    depth,
  };
}
