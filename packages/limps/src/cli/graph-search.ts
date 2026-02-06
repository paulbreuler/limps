import type { Database as DatabaseType } from 'better-sqlite3';
import type { ServerConfig } from '../config.js';
import { GraphStorage } from '../graph/storage.js';
import type { EmbeddingStore } from '../graph/similarity.js';
import { HybridRetriever, type FTSIndex, type SearchResult } from '../retrieval/hybrid.js';
import { getRecipe } from '../retrieval/recipes.js';

export interface GraphSearchOptions {
  topK?: number;
  recipe?: string;
}

export interface GraphSearchResult {
  query: string;
  results: SearchResult[];
  recipe: string;
  total: number;
}

function createFTSAdapter(storage: GraphStorage): FTSIndex {
  return {
    search(query: string, limit: number): { canonicalId: string; score: number }[] {
      const entities = storage.searchEntities(query, limit);
      return entities.map((entity, index) => ({
        canonicalId: entity.canonicalId,
        score: 1 / (index + 1),
      }));
    },
  };
}

function createNullEmbeddingStore(): EmbeddingStore {
  return {
    get(): null {
      return null;
    },
  };
}

export async function graphSearch(
  _config: ServerConfig,
  db: DatabaseType,
  query: string,
  options?: GraphSearchOptions
): Promise<GraphSearchResult> {
  const storage = new GraphStorage(db);
  const fts = createFTSAdapter(storage);
  const embeddings = createNullEmbeddingStore();
  const topK = options?.topK ?? 10;

  const recipeOverride = options?.recipe ? getRecipe(options.recipe) : undefined;
  const retriever = new HybridRetriever(storage, embeddings, fts);
  const results = await retriever.search(query, topK, recipeOverride);

  return {
    query,
    results,
    recipe: recipeOverride?.name ?? 'auto',
    total: results.length,
  };
}
