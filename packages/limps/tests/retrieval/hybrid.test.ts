import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { createGraphSchema } from '../../src/graph/schema.js';
import { GraphStorage } from '../../src/graph/storage.js';
import { HybridRetriever, type FTSIndex } from '../../src/retrieval/hybrid.js';
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
});
