import type { Database as DatabaseType } from 'better-sqlite3';
import type { ServerConfig } from '../config.js';
import { GraphStorage } from '../graph/storage.js';
import type { EmbeddingStore } from '../graph/similarity.js';
import { EntityResolver } from '../graph/resolver.js';

export type GraphSuggestType = 'consolidate' | 'next-task';

export interface GraphSuggestOptions {
  planId?: string;
}

export interface GraphSuggestResult {
  type: GraphSuggestType;
  suggestions: string[];
}

function createNullEmbeddingStore(): EmbeddingStore {
  return {
    get(): null {
      return null;
    },
  };
}

export function graphSuggest(
  _config: ServerConfig,
  db: DatabaseType,
  type: GraphSuggestType,
  _options?: GraphSuggestOptions
): GraphSuggestResult {
  const storage = new GraphStorage(db);

  if (type === 'consolidate') {
    const embeddings = createNullEmbeddingStore();
    const resolver = new EntityResolver(storage, embeddings);
    const result = resolver.resolveAll();

    return {
      type,
      suggestions: result.suggestions,
    };
  }

  // next-task: suggest based on graph analysis
  const agents = storage.getEntitiesByType('agent');
  const suggestions: string[] = [];

  const gapAgents = agents.filter((a) => a.metadata?.status === 'GAP' || !a.metadata?.status);
  for (const agent of gapAgents.slice(0, 5)) {
    const deps = storage
      .getRelationships(agent.id, 'outgoing')
      .filter((r) => r.relationType === 'DEPENDS_ON');

    if (deps.length === 0) {
      suggestions.push(`Ready: ${agent.canonicalId} "${agent.name}" has no dependencies`);
    }
  }

  return { type, suggestions };
}
