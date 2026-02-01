import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { createGraphSchema } from '../../src/graph/schema.js';
import { GraphStorage, computeContentHash, hasChanged } from '../../src/graph/storage.js';
import type { Entity } from '../../src/graph/types.js';

describe('GraphStorage', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let storage: GraphStorage;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-graph-${Date.now()}.sqlite`);
    db = new Database(dbPath);
    createGraphSchema(db);
    storage = new GraphStorage(db);
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

  it('upserts and retrieves entities', () => {
    const entity = storage.upsertEntity({
      type: 'plan',
      canonicalId: 'plan:0001',
      name: 'Plan 0001',
      sourcePath: 'plans/0001/plan.md',
      contentHash: 'hash-1',
      metadata: { owner: 'team-a' },
    });

    const fetched = storage.getEntity(entity.canonicalId, entity.type);
    expect(fetched?.name).toBe('Plan 0001');
    expect(fetched?.metadata).toEqual({ owner: 'team-a' });

    const byType = storage.getEntitiesByType('plan');
    expect(byType).toHaveLength(1);
  });

  it('creates relationships and finds neighbors', () => {
    const source = storage.upsertEntity({
      type: 'plan',
      canonicalId: 'plan:0002',
      name: 'Plan 0002',
      metadata: {},
    });
    const target = storage.upsertEntity({
      type: 'agent',
      canonicalId: 'agent:0002#001',
      name: 'Agent 001',
      metadata: {},
    });

    storage.upsertRelationship({
      sourceId: source.id,
      targetId: target.id,
      relationType: 'CONTAINS',
      confidence: 1,
      metadata: {},
    });

    const neighbors = storage.getNeighbors(source.id, 'CONTAINS');
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0]?.canonicalId).toBe(target.canonicalId);
  });

  it('finds paths with depth and path limits', () => {
    const a = storage.upsertEntity({
      type: 'plan',
      canonicalId: 'plan:0003',
      name: 'Plan 0003',
      metadata: {},
    });
    const b = storage.upsertEntity({
      type: 'feature',
      canonicalId: 'feature:0003:1',
      name: 'Feature 1',
      metadata: {},
    });
    const c = storage.upsertEntity({
      type: 'agent',
      canonicalId: 'agent:0003#001',
      name: 'Agent 001',
      metadata: {},
    });

    storage.upsertRelationship({
      sourceId: a.id,
      targetId: b.id,
      relationType: 'CONTAINS',
      confidence: 1,
      metadata: {},
    });
    storage.upsertRelationship({
      sourceId: b.id,
      targetId: c.id,
      relationType: 'IMPLEMENTS',
      confidence: 1,
      metadata: {},
    });

    const paths = storage.getPath(a.id, c.id, 4, 1);
    expect(paths).toHaveLength(1);
    expect(paths?.[0]?.map((node) => node.canonicalId)).toEqual([
      a.canonicalId,
      b.canonicalId,
      c.canonicalId,
    ]);
  });

  it('bulk upserts entities and updates conflicts', () => {
    const entities: Entity[] = [
      {
        id: 0,
        type: 'tag',
        canonicalId: 'tag:alpha',
        name: 'Alpha',
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 0,
        type: 'tag',
        canonicalId: 'tag:alpha',
        name: 'Alpha Updated',
        metadata: { updated: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const changes = storage.bulkUpsertEntities(entities);
    expect(changes).toBeGreaterThan(0);

    const fetched = storage.getEntity('tag:alpha', 'tag');
    expect(fetched?.name).toBe('Alpha Updated');
    expect(fetched?.metadata).toEqual({ updated: true });
  });

  it('supports FTS search', () => {
    storage.upsertEntity({
      type: 'concept',
      canonicalId: 'concept:graph',
      name: 'Knowledge Graph',
      metadata: {},
    });

    const results = storage.searchEntities('Knowledge', 10);
    expect(results).toHaveLength(1);
    expect(results[0]?.canonicalId).toBe('concept:graph');
  });

  it('detects content changes by hash', () => {
    const content = 'Hello world';
    const hash = computeContentHash(content);

    expect(hasChanged(storage, 'docs/example.md', hash)).toBe(true);

    storage.upsertEntity({
      type: 'file',
      canonicalId: 'file:docs/example.md',
      name: 'example.md',
      sourcePath: 'docs/example.md',
      contentHash: hash,
      metadata: {},
    });

    expect(hasChanged(storage, 'docs/example.md', hash)).toBe(false);
    expect(hasChanged(storage, 'docs/example.md', `${hash}-changed`)).toBe(true);
  });
});
