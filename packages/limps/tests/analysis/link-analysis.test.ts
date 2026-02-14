/**
 * Tests for LinkAnalyzer - PageRank and hub document detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createGraphSchema } from '../../src/graph/schema.js';
import { GraphStorage } from '../../src/graph/storage.js';
import { LinkAnalyzer, computePageRank } from '../../src/analysis/link-analysis.js';
import type { Entity } from '../../src/graph/types.js';

describe('computePageRank', () => {
  it('should return empty map for no entities', () => {
    const scores = computePageRank([], []);
    expect(scores.size).toBe(0);
  });

  it('should assign equal scores to disconnected entities', () => {
    const entities: Entity[] = [
      {
        id: 1,
        type: 'file',
        canonicalId: 'file:a.md',
        name: 'a.md',
        metadata: {},
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 2,
        type: 'file',
        canonicalId: 'file:b.md',
        name: 'b.md',
        metadata: {},
        createdAt: '',
        updatedAt: '',
      },
    ];
    const scores = computePageRank(entities, []);

    // With no links, all scores converge to 1/n
    const scoreA = scores.get(1) ?? 0;
    const scoreB = scores.get(2) ?? 0;
    expect(Math.abs(scoreA - scoreB)).toBeLessThan(0.001);
  });

  it('should rank a highly referenced entity higher', () => {
    const entities: Entity[] = [
      {
        id: 1,
        type: 'file',
        canonicalId: 'file:hub.md',
        name: 'hub.md',
        metadata: {},
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 2,
        type: 'file',
        canonicalId: 'file:a.md',
        name: 'a.md',
        metadata: {},
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 3,
        type: 'file',
        canonicalId: 'file:b.md',
        name: 'b.md',
        metadata: {},
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 4,
        type: 'file',
        canonicalId: 'file:c.md',
        name: 'c.md',
        metadata: {},
        createdAt: '',
        updatedAt: '',
      },
    ];
    // a, b, c all reference hub
    const rels = [
      {
        id: 1,
        sourceId: 2,
        targetId: 1,
        relationType: 'REFERENCES' as const,
        confidence: 1,
        metadata: {},
        createdAt: '',
      },
      {
        id: 2,
        sourceId: 3,
        targetId: 1,
        relationType: 'REFERENCES' as const,
        confidence: 1,
        metadata: {},
        createdAt: '',
      },
      {
        id: 3,
        sourceId: 4,
        targetId: 1,
        relationType: 'REFERENCES' as const,
        confidence: 1,
        metadata: {},
        createdAt: '',
      },
    ];

    const scores = computePageRank(entities, rels);
    const hubScore = scores.get(1) ?? 0;
    const aScore = scores.get(2) ?? 0;

    expect(hubScore).toBeGreaterThan(aScore);
  });
});

describe('LinkAnalyzer', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    createGraphSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return empty results for empty graph', () => {
    const analyzer = new LinkAnalyzer(db);
    const result = analyzer.findHubDocuments();

    expect(result.hubs).toHaveLength(0);
    expect(result.totalDocuments).toBe(0);
    expect(result.totalReferences).toBe(0);
  });

  it('should find hub documents from REFERENCES relationships', () => {
    const storage = new GraphStorage(db);

    // Create entities
    const hub = storage.upsertEntity({
      type: 'file',
      canonicalId: 'file:hub.md',
      name: 'hub.md',
      metadata: {},
    });
    const a = storage.upsertEntity({
      type: 'file',
      canonicalId: 'file:a.md',
      name: 'a.md',
      metadata: {},
    });
    const b = storage.upsertEntity({
      type: 'file',
      canonicalId: 'file:b.md',
      name: 'b.md',
      metadata: {},
    });

    // a and b both reference hub
    storage.upsertRelationship({
      sourceId: a.id,
      targetId: hub.id,
      relationType: 'REFERENCES',
      confidence: 1.0,
      metadata: {},
    });
    storage.upsertRelationship({
      sourceId: b.id,
      targetId: hub.id,
      relationType: 'REFERENCES',
      confidence: 1.0,
      metadata: {},
    });

    const analyzer = new LinkAnalyzer(db);
    const result = analyzer.findHubDocuments(10);

    expect(result.totalDocuments).toBe(3);
    expect(result.totalReferences).toBe(2);
    expect(result.hubs.length).toBeGreaterThan(0);
    // Hub should be ranked first
    expect(result.hubs[0]?.entityId).toBe('file:hub.md');
    expect(result.hubs[0]?.inDegree).toBe(2);
  });

  it('should respect topK limit', () => {
    const storage = new GraphStorage(db);

    for (let i = 0; i < 5; i++) {
      storage.upsertEntity({
        type: 'file',
        canonicalId: `file:doc-${i}.md`,
        name: `doc-${i}.md`,
        metadata: {},
      });
    }

    const analyzer = new LinkAnalyzer(db);
    const result = analyzer.findHubDocuments(2);

    expect(result.hubs).toHaveLength(2);
  });

  it('should compute full PageRank across all relationship types', () => {
    const storage = new GraphStorage(db);

    const plan = storage.upsertEntity({
      type: 'plan',
      canonicalId: 'plan:0001',
      name: 'Plan 1',
      metadata: {},
    });
    const agent = storage.upsertEntity({
      type: 'agent',
      canonicalId: 'agent:0001#000',
      name: 'Agent 0',
      metadata: {},
    });

    storage.upsertRelationship({
      sourceId: plan.id,
      targetId: agent.id,
      relationType: 'CONTAINS',
      confidence: 1.0,
      metadata: {},
    });

    const analyzer = new LinkAnalyzer(db);
    const ranks = analyzer.computeFullPageRank();

    expect(ranks.size).toBe(2);
    expect(ranks.has('plan:0001')).toBe(true);
    expect(ranks.has('agent:0001#000')).toBe(true);
  });
});
