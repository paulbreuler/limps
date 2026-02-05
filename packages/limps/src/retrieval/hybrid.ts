import type { Entity } from '../graph/types.js';
import type { GraphStorage } from '../graph/storage.js';
import type { EmbeddingStore } from '../graph/similarity.js';
import { routeQuery } from './router.js';
import { rrf, type RankedItem } from './rrf.js';

export interface FTSIndex {
  search(query: string, limit: number): { canonicalId: string; score: number }[];
}

export interface SearchResult {
  entity: Entity;
  score: number;
  strategy: 'lexical' | 'semantic' | 'graph' | 'hybrid';
}

interface SimilarCandidate {
  canonicalId: string;
  score?: number;
  similarity?: number;
}

export class HybridRetriever {
  constructor(
    private readonly storage: GraphStorage,
    private readonly embeddings: EmbeddingStore,
    private readonly fts: FTSIndex
  ) {}

  async search(query: string, topK = 10): Promise<SearchResult[]> {
    const strategy = routeQuery(query);
    const overRetrieveK = Math.max(1, topK * 3);
    const rankings = new Map<string, RankedItem[]>();

    if (strategy.weights.lexical > 0) {
      rankings.set(
        'lexical',
        this.fts.search(query, overRetrieveK).map((item) => ({
          id: item.canonicalId,
          score: item.score,
          source: 'lexical' as const,
        }))
      );
    }

    if (strategy.weights.semantic > 0 && this.embeddings.embed && this.embeddings.findSimilar) {
      const queryVector = await Promise.resolve(this.embeddings.embed(query));
      const semantic = this.embeddings.findSimilar(queryVector, overRetrieveK);
      rankings.set(
        'semantic',
        semantic.map((item: SimilarCandidate) => ({
          id: item.canonicalId,
          score: item.similarity ?? item.score ?? 0,
          source: 'semantic' as const,
        }))
      );
    }

    if (strategy.weights.graph > 0) {
      const graphEntities = this.traverseFromSeeds(this.extractSeeds(query), overRetrieveK);
      rankings.set(
        'graph',
        graphEntities.map((item, idx) => ({
          id: item.canonicalId,
          score: 1 / (idx + 1),
          source: 'graph' as const,
        }))
      );
    }

    const fused = rrf(rankings, strategy.weights);

    return fused
      .slice(0, topK)
      .map((item) => {
        const entity = this.storage.getEntity(item.id);
        if (!entity) {
          return null;
        }
        return {
          entity,
          score: item.score,
          strategy: strategy.primary,
        } satisfies SearchResult;
      })
      .filter((item): item is SearchResult => Boolean(item));
  }

  private extractSeeds(query: string): string[] {
    const seeds = new Set<string>();

    for (const match of query.matchAll(/plan\s*(\d{4})/gi)) {
      if (match[1]) {
        seeds.add(`plan:${match[1]}`);
      }
    }
    for (const match of query.matchAll(/(\d{4})#(\d{3})/g)) {
      if (match[1] && match[2]) {
        seeds.add(`agent:${match[1]}#${match[2]}`);
      }
    }

    return Array.from(seeds);
  }

  private traverseFromSeeds(seeds: string[], limit: number): Entity[] {
    const visited = new Set<string>();
    const results: Entity[] = [];

    for (const seed of seeds) {
      const seedEntity = this.storage.getEntity(seed);
      if (!seedEntity) {
        continue;
      }

      for (const neighbor of this.storage.getNeighbors(seedEntity.id)) {
        if (visited.has(neighbor.canonicalId)) {
          continue;
        }
        visited.add(neighbor.canonicalId);
        results.push(neighbor);
        if (results.length >= limit) {
          return results;
        }
      }
    }

    return results;
  }
}
