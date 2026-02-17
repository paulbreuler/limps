import type { Database as DatabaseType } from 'better-sqlite3';
import type { ServerConfig } from '../config.js';
import { GraphStorage } from '../graph/storage.js';
import type { EmbeddingStore } from '../graph/similarity.js';
import { EntityResolver } from '../graph/resolver.js';
import { LinkAnalyzer } from '../analysis/link-analysis.js';
import { discoverRelationships } from '../analysis/relationship-discoverer.js';

export type GraphSuggestType = 'consolidate' | 'next-task' | 'hub-documents' | 'relationships';

export interface GraphSuggestOptions {
  planId?: string;
  topK?: number;
  minConfidence?: number;
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

  if (type === 'hub-documents') {
    const analyzer = new LinkAnalyzer(db);
    const topK = _options?.topK ?? 10;
    const hubResult = analyzer.findHubDocuments(topK);
    const suggestions = hubResult.hubs.map(
      (hub) =>
        `${hub.entityId} "${hub.name}" (score: ${hub.score.toFixed(4)}, in: ${hub.inDegree}, out: ${hub.outDegree})`
    );
    return { type, suggestions };
  }

  if (type === 'relationships') {
    const minConf = _options?.minConfidence ?? 0.3;
    const discovered = discoverRelationships(db, {
      minConfidence: minConf,
      planId: _options?.planId,
    });
    const suggestions = discovered.relationships.map(
      (r) =>
        `${r.sourceId} "${r.sourceName}" <-> ${r.targetId} "${r.targetName}" (confidence: ${r.confidence.toFixed(2)}, ${r.reason})`
    );
    return { type, suggestions };
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
