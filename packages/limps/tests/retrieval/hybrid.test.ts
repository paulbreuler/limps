import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { createGraphSchema } from '../../src/graph/schema.js';
import { GraphStorage } from '../../src/graph/storage.js';
import { HybridRetriever, type FTSIndex } from '../../src/retrieval/hybrid.js';
import type { SearchRecipe } from '../../src/retrieval/types.js';
import type { EmbeddingStore } from '../../src/graph/similarity.js';

class FakeFTS implements FTSIndex {
  constructor(private readonly items: { canonicalId: string; score: number }[]) {}

  search(): { canonicalId: string; score: number }[] {
    return this.items;
  }
}

class FakeEmbeddings implements EmbeddingStore {
  private readonly vectors = new Map<string, number[]>();

  set(id: string, vector: number[]): void {
    this.vectors.set(id, vector);
  }

  get(canonicalId: string): number[] | null {
    return this.vectors.get(canonicalId) ?? null;
  }

  embed(text: string): number[] {
    return text.includes('auth') ? [1, 0] : [0, 1];
  }

  findSimilar(vector: number[]): { canonicalId: string; score: number }[] {
    return Array.from(this.vectors.entries())
      .map(([canonicalId, candidate]) => {
        const dot = (vector[0] ?? 0) * (candidate[0] ?? 0) + (vector[1] ?? 0) * (candidate[1] ?? 0);
        return { canonicalId, score: dot };
      })
      .sort((a, b) => b.score - a.score);
  }
}

describe('HybridRetriever', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let storage: GraphStorage;
  let embeddings: FakeEmbeddings;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-hybrid-retrieval-${Date.now()}.sqlite`);
    db = new Database(dbPath);
    createGraphSchema(db);
    storage = new GraphStorage(db);
    embeddings = new FakeEmbeddings();
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  it('returns lexical entities for direct plan lookup', async () => {
    const plan = storage.upsertEntity({
      type: 'plan',
      canonicalId: 'plan:0042',
      name: 'Knowledge Graph Foundation',
      metadata: {},
    });

    const retriever = new HybridRetriever(
      storage,
      embeddings,
      new FakeFTS([{ canonicalId: plan.canonicalId, score: 1 }])
    );
    const results = await retriever.search('plan 0042', 5);

    expect(results).toHaveLength(1);
    expect(results[0]?.entity.canonicalId).toBe('plan:0042');
    expect(results[0]?.recipe).toBe('LEXICAL_FIRST');
  });

  it('uses one-hop graph traversal from extracted seeds', async () => {
    const agent = storage.upsertEntity({
      type: 'agent',
      canonicalId: 'agent:0042#001',
      name: 'Agent 001',
      metadata: {},
    });
    const feature = storage.upsertEntity({
      type: 'feature',
      canonicalId: 'feature:0042#1',
      name: 'Entity Schema',
      metadata: {},
    });
    storage.upsertRelationship({
      sourceId: agent.id,
      targetId: feature.id,
      relationType: 'IMPLEMENTS',
      confidence: 1,
      metadata: {},
    });

    const retriever = new HybridRetriever(storage, embeddings, new FakeFTS([]));
    const results = await retriever.search('what blocks agent 0042#001', 5);

    expect(results.some((r) => r.entity.canonicalId === feature.canonicalId)).toBe(true);
    expect(results.every((r) => r.recipe === 'EDGE_HYBRID_RRF')).toBe(true);
  });

  it('filters semantic results by similarityThreshold at recipe level', async () => {
    const entity1 = storage.upsertEntity({
      type: 'concept',
      canonicalId: 'concept:auth',
      name: 'Authentication',
      metadata: {},
    });
    const entity2 = storage.upsertEntity({
      type: 'concept',
      canonicalId: 'concept:logging',
      name: 'Logging',
      metadata: {},
    });

    embeddings.set(entity1.canonicalId, [1, 0]); // high similarity to "auth" query
    embeddings.set(entity2.canonicalId, [0, 1]); // low similarity to "auth" query

    const recipe: SearchRecipe = {
      name: 'TEST_THRESHOLD',
      description: 'Test threshold filtering',
      weights: { lexical: 0.0, semantic: 1.0, graph: 0.0 },
      similarityThreshold: 0.5,
    };

    const retriever = new HybridRetriever(storage, embeddings, new FakeFTS([]));
    const results = await retriever.search('auth concepts', 10, recipe);

    // Only the auth entity should pass the threshold (dot product = 1)
    // Logging entity has score 0, which is below 0.5 threshold
    expect(results.some((r) => r.entity.canonicalId === 'concept:auth')).toBe(true);
    expect(results.some((r) => r.entity.canonicalId === 'concept:logging')).toBe(false);
  });

  it('skips BFS when graph weight > 0 but no graphConfig', async () => {
    const entity = storage.upsertEntity({
      type: 'plan',
      canonicalId: 'plan:0001',
      name: 'Plan 1',
      metadata: {},
    });

    const recipe: SearchRecipe = {
      name: 'NO_GRAPH_CONFIG',
      description: 'Graph weight without config',
      weights: { lexical: 0.5, semantic: 0.0, graph: 0.5 },
      // No graphConfig - BFS should be skipped
    };

    const retriever = new HybridRetriever(
      storage,
      embeddings,
      new FakeFTS([{ canonicalId: entity.canonicalId, score: 1 }])
    );
    const results = await retriever.search('plan 0001', 5, recipe);

    // Should still return lexical results; no crash from missing graphConfig
    expect(results).toHaveLength(1);
    expect(results[0]?.entity.canonicalId).toBe('plan:0001');
  });

  it('uses recipe override at search time', async () => {
    const entity = storage.upsertEntity({
      type: 'plan',
      canonicalId: 'plan:0042',
      name: 'Plan 42',
      metadata: {},
    });

    const defaultRecipe: SearchRecipe = {
      name: 'DEFAULT',
      description: 'Default recipe',
      weights: { lexical: 0.0, semantic: 0.0, graph: 1.0 },
      graphConfig: { maxDepth: 1, hopDecay: 0.5 },
    };

    const overrideRecipe: SearchRecipe = {
      name: 'OVERRIDE',
      description: 'Override recipe',
      weights: { lexical: 1.0, semantic: 0.0, graph: 0.0 },
    };

    const retriever = new HybridRetriever(
      storage,
      embeddings,
      new FakeFTS([{ canonicalId: entity.canonicalId, score: 1 }]),
      defaultRecipe
    );
    const results = await retriever.search('plan 0042', 5, overrideRecipe);

    expect(results[0]?.recipe).toBe('OVERRIDE');
  });

  it('uses default recipe from constructor', async () => {
    const entity = storage.upsertEntity({
      type: 'plan',
      canonicalId: 'plan:0042',
      name: 'Plan 42',
      metadata: {},
    });

    const defaultRecipe: SearchRecipe = {
      name: 'MY_DEFAULT',
      description: 'Default recipe',
      weights: { lexical: 1.0, semantic: 0.0, graph: 0.0 },
    };

    const retriever = new HybridRetriever(
      storage,
      embeddings,
      new FakeFTS([{ canonicalId: entity.canonicalId, score: 1 }]),
      defaultRecipe
    );
    const results = await retriever.search('something random', 5);

    expect(results[0]?.recipe).toBe('MY_DEFAULT');
  });

  it('returns multi-hop BFS results with correct scoring', async () => {
    // Chain: plan:0001 -> agent:0001#001 -> file:auth.ts
    const plan = storage.upsertEntity({
      type: 'plan',
      canonicalId: 'plan:0001',
      name: 'Plan 1',
      metadata: {},
    });
    const agent = storage.upsertEntity({
      type: 'agent',
      canonicalId: 'agent:0001#001',
      name: 'Agent 1',
      metadata: {},
    });
    const file = storage.upsertEntity({
      type: 'file',
      canonicalId: 'file:auth.ts',
      name: 'auth.ts',
      metadata: {},
    });
    storage.upsertRelationship({
      sourceId: plan.id,
      targetId: agent.id,
      relationType: 'CONTAINS',
      confidence: 1,
      metadata: {},
    });
    storage.upsertRelationship({
      sourceId: agent.id,
      targetId: file.id,
      relationType: 'MODIFIES',
      confidence: 1,
      metadata: {},
    });

    const recipe: SearchRecipe = {
      name: 'DEEP_GRAPH',
      description: 'Deep graph',
      weights: { lexical: 0.0, semantic: 0.0, graph: 1.0 },
      graphConfig: { maxDepth: 2, hopDecay: 0.5 },
    };

    const retriever = new HybridRetriever(storage, embeddings, new FakeFTS([]));
    const results = await retriever.search('plan 0001', 10, recipe);

    // Should find both 1-hop and 2-hop neighbors
    expect(results.some((r) => r.entity.canonicalId === 'agent:0001#001')).toBe(true);
    expect(results.some((r) => r.entity.canonicalId === 'file:auth.ts')).toBe(true);

    // 1-hop entity should score higher than 2-hop
    const agentResult = results.find((r) => r.entity.canonicalId === 'agent:0001#001');
    const fileResult = results.find((r) => r.entity.canonicalId === 'file:auth.ts');
    expect(agentResult!.score).toBeGreaterThan(fileResult!.score);
  });
});
