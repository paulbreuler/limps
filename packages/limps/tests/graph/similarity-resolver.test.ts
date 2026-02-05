import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { createGraphSchema } from '../../src/graph/schema.js';
import { GraphStorage } from '../../src/graph/storage.js';
import {
  THRESHOLDS,
  computeSimilarity,
  computeStructuralSimilarityFromNeighbors,
  cosineSimilarity,
  jaccardSimilarity,
  tokenize,
  type EmbeddingStore,
} from '../../src/graph/similarity.js';
import { EntityResolver } from '../../src/graph/resolver.js';

class InMemoryEmbeddingStore implements EmbeddingStore {
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

  findSimilar(vector: number[], limit: number): { canonicalId: string; score: number }[] {
    const scored: { canonicalId: string; score: number }[] = [];
    for (const [canonicalId, candidate] of this.vectors.entries()) {
      scored.push({ canonicalId, score: cosineSimilarity(vector, candidate) });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

describe('graph similarity + resolver', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let storage: GraphStorage;
  let embeddings: InMemoryEmbeddingStore;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-graph-similarity-${Date.now()}.sqlite`);
    db = new Database(dbPath);
    createGraphSchema(db);
    storage = new GraphStorage(db);
    embeddings = new InMemoryEmbeddingStore();
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

  it('computes lexical and semantic similarity correctly', () => {
    expect(tokenize('Entity Resolution & Similarity')).toEqual(
      new Set(['entity', 'resolution', 'similarity'])
    );

    const lexical = jaccardSimilarity(
      new Set(['entity', 'resolution']),
      new Set(['entity', 'similarity'])
    );
    expect(lexical).toBeCloseTo(1 / 3, 6);

    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('computes structural similarity from shared neighbors', () => {
    const value = computeStructuralSimilarityFromNeighbors(
      new Set(['file:src/auth.ts', 'tag:security']),
      new Set(['file:src/auth.ts', 'tag:graph'])
    );

    expect(value).toBeCloseTo(1 / 3, 6);
  });

  it('creates SIMILAR_TO relationships and returns similar matches', () => {
    const featureA = storage.upsertEntity({
      type: 'feature',
      canonicalId: 'feature:0042#1',
      name: 'Authentication Pipeline',
      metadata: {},
    });
    const featureB = storage.upsertEntity({
      type: 'feature',
      canonicalId: 'feature:0050#3',
      name: 'Authentication Pipeline',
      metadata: {},
    });

    const sharedFile = storage.upsertEntity({
      type: 'file',
      canonicalId: 'file:src/auth.ts',
      name: 'src/auth.ts',
      metadata: {},
    });

    storage.upsertRelationship({
      sourceId: featureA.id,
      targetId: sharedFile.id,
      relationType: 'MODIFIES',
      confidence: 1,
      metadata: {},
    });
    storage.upsertRelationship({
      sourceId: featureB.id,
      targetId: sharedFile.id,
      relationType: 'MODIFIES',
      confidence: 1,
      metadata: {},
    });

    embeddings.set(featureA.canonicalId, [1, 0]);
    embeddings.set(featureB.canonicalId, [1, 0]);

    const score = computeSimilarity(featureA, featureB, embeddings, {
      structural: computeStructuralSimilarityFromNeighbors(
        new Set(['file:src/auth.ts']),
        new Set(['file:src/auth.ts'])
      ),
    });
    expect(score.combined).toBeGreaterThanOrEqual(THRESHOLDS.similar);

    const resolver = new EntityResolver(storage, embeddings);
    const result = resolver.resolveAll();

    expect(result.duplicates.length + result.similar.length).toBe(1);
    expect(result.suggestions.length).toBeGreaterThan(0);

    const similarRels = storage.getRelationshipsByType('SIMILAR_TO');
    expect(similarRels).toHaveLength(1);
    expect(similarRels[0]?.confidence).toBeGreaterThanOrEqual(THRESHOLDS.similar);
  });

  it('checkNewFeature returns existing high-similarity entities', () => {
    const featureA = storage.upsertEntity({
      type: 'feature',
      canonicalId: 'feature:0042#10',
      name: 'Auth Session Refresh',
      metadata: {},
    });
    const featureB = storage.upsertEntity({
      type: 'feature',
      canonicalId: 'feature:0042#11',
      name: 'Dashboard Filters',
      metadata: {},
    });

    embeddings.set(featureA.canonicalId, [1, 0]);
    embeddings.set(featureB.canonicalId, [0, 1]);

    const resolver = new EntityResolver(storage, embeddings);
    const matches = resolver.checkNewFeature('auth token', 'auth refresh flow');

    expect(matches.map((m) => m.canonicalId)).toContain(featureA.canonicalId);
    expect(matches.map((m) => m.canonicalId)).not.toContain(featureB.canonicalId);
  });
});
