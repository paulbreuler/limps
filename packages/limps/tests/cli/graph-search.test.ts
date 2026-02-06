import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { createGraphSchema } from '../../src/graph/schema.js';
import { GraphStorage } from '../../src/graph/storage.js';
import { graphSearch } from '../../src/cli/graph-search.js';
import type { ServerConfig } from '../../src/config.js';

describe('graphSearch', () => {
  let dbPath: string;
  let db: Database.Database | null = null;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-graph-search-${Date.now()}.sqlite`);
    db = new Database(dbPath);
    createGraphSchema(db);
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

  const config: ServerConfig = {
    plansPath: '/tmp/plans',
    dataPath: '/tmp/data',
    scoring: { weights: { dependency: 40, priority: 30, workload: 30 }, biases: {} },
  };

  it('returns empty results for empty graph', async () => {
    const result = await graphSearch(config, db!, 'auth');

    expect(result.query).toBe('auth');
    expect(result.results).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('finds entities matching query', async () => {
    const storage = new GraphStorage(db!);
    storage.upsertEntity({
      type: 'feature',
      canonicalId: 'feature:0001#1',
      name: 'Authentication Login',
      metadata: {},
    });

    const result = await graphSearch(config, db!, 'Authentication');

    expect(result.results.length).toBeGreaterThanOrEqual(1);
    expect(result.results[0]?.entity.name).toBe('Authentication Login');
  });

  it('respects topK option', async () => {
    const storage = new GraphStorage(db!);
    for (let i = 0; i < 5; i++) {
      storage.upsertEntity({
        type: 'feature',
        canonicalId: `feature:0001#${i}`,
        name: `Feature ${i} auth`,
        metadata: {},
      });
    }

    const result = await graphSearch(config, db!, 'auth', { topK: 2 });

    expect(result.results.length).toBeLessThanOrEqual(2);
  });
});
