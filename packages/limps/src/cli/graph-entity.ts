import type { Database as DatabaseType } from 'better-sqlite3';
import type { ServerConfig } from '../config.js';
import { GraphStorage } from '../graph/storage.js';
import type { Entity, Relationship } from '../graph/types.js';

export interface GraphEntityResult {
  entity: Entity;
  outgoing: Relationship[];
  incoming: Relationship[];
  neighbors: Entity[];
}

export function graphEntity(
  _config: ServerConfig,
  db: DatabaseType,
  canonicalId: string
): GraphEntityResult {
  const storage = new GraphStorage(db);

  const entity = storage.getEntity(canonicalId);
  if (!entity) {
    throw new Error(`Entity not found: ${canonicalId}`);
  }

  const outgoing = storage.getRelationships(entity.id, 'outgoing');
  const incoming = storage.getRelationships(entity.id, 'incoming');
  const neighbors = storage.getNeighbors(entity.id);

  return {
    entity,
    outgoing,
    incoming,
    neighbors,
  };
}
