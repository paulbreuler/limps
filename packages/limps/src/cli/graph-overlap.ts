import type { Database as DatabaseType } from 'better-sqlite3';
import type { ServerConfig } from '../config.js';
import { GraphStorage } from '../graph/storage.js';
import type { EmbeddingStore } from '../graph/similarity.js';
import { EntityResolver, type ResolutionResult } from '../graph/resolver.js';

export interface GraphOverlapOptions {
  planId?: string;
  threshold?: number;
}

export interface GraphOverlapResult extends ResolutionResult {
  totalFeatures: number;
}

function createNullEmbeddingStore(): EmbeddingStore {
  return {
    get(): null {
      return null;
    },
  };
}

export function graphOverlap(
  _config: ServerConfig,
  db: DatabaseType,
  _options?: GraphOverlapOptions
): GraphOverlapResult {
  const storage = new GraphStorage(db);
  const embeddings = createNullEmbeddingStore();
  const resolver = new EntityResolver(storage, embeddings);
  const result = resolver.resolveAll();

  const features = storage.getEntitiesByType('feature');

  return {
    ...result,
    totalFeatures: features.length,
  };
}
