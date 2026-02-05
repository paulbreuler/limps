import type { Entity } from '../graph/types.js';
import type { GraphStorage } from '../graph/storage.js';
import type { EmbeddingStore } from '../graph/similarity.js';
import { routeQuery } from './router.js';
import { rrf, type RankedItem } from './rrf.js';
import { bfsExpansion, scoreByHopDistance } from './bfs.js';
import type { SearchRecipe } from './types.js';

export interface FTSIndex {
  search(query: string, limit: number): { canonicalId: string; score: number }[];
}

export interface SearchResult {
  entity: Entity;
  score: number;
  recipe: string;
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
    private readonly fts: FTSIndex,
    private readonly defaultRecipe?: SearchRecipe
  ) {}

  async search(query: string, topK = 10, recipeOverride?: SearchRecipe): Promise<SearchResult[]> {
    const recipe = recipeOverride || this.defaultRecipe || routeQuery(query);
    const overRetrieveK = Math.max(1, topK * 3);
    const rankings = new Map<string, RankedItem[]>();

    if (recipe.weights.lexical > 0) {
      rankings.set(
        'lexical',
        this.fts.search(query, overRetrieveK).map((item) => ({
          id: item.canonicalId,
          score: item.score,
          source: 'lexical' as const,
        }))
      );
    }

    if (recipe.weights.semantic > 0 && this.embeddings.embed && this.embeddings.findSimilar) {
      const queryVector = await Promise.resolve(this.embeddings.embed(query));
      let semantic = this.embeddings.findSimilar(queryVector, overRetrieveK);

      // Apply similarity threshold if configured
      if (recipe.graphConfig?.similarityThreshold !== undefined) {
        const threshold = recipe.graphConfig.similarityThreshold;
        semantic = semantic.filter((item: SimilarCandidate) => {
          const similarity = item.similarity ?? item.score ?? 0;
          return similarity >= threshold;
        });
      }

      rankings.set(
        'semantic',
        semantic.map((item: SimilarCandidate) => ({
          id: item.canonicalId,
          score: item.similarity ?? item.score ?? 0,
          source: 'semantic' as const,
        }))
      );
    }

    if (recipe.weights.graph > 0) {
      const seeds = this.extractSeeds(query);
      const graphConfig = recipe.graphConfig || { maxDepth: 1, hopDecay: 0.5 };
      const bfsNodes = bfsExpansion(this.storage, seeds, graphConfig, overRetrieveK);
      const scoredEntities = scoreByHopDistance(bfsNodes, graphConfig.hopDecay);

      rankings.set(
        'graph',
        scoredEntities.map((item) => ({
          id: item.entity.canonicalId,
          score: item.score,
          source: 'graph' as const,
        }))
      );
    }

    const fused = rrf(rankings, recipe.weights);

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
          recipe: recipe.name,
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
}
