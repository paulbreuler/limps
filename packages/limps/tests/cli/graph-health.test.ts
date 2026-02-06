import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { createGraphSchema } from '../../src/graph/schema.js';
import { GraphStorage } from '../../src/graph/storage.js';
import { graphHealth, renderGraphHealth } from '../../src/cli/graph-health.js';
import type { ServerConfig } from '../../src/config.js';

describe('graphHealth', () => {
  let dbPath: string;
  let db: Database.Database | null = null;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-graph-health-${Date.now()}.sqlite`);
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

  it('returns stats and empty conflicts for empty graph', () => {
    const result = graphHealth(config, db!);

    expect(result.stats.totalEntities).toBe(0);
    expect(result.stats.totalRelations).toBe(0);
    expect(result.conflicts).toHaveLength(0);
    expect(result.summary.conflictCount).toBe(0);
  });

  it('returns entity counts when entities exist', () => {
    const storage = new GraphStorage(db!);
    storage.upsertEntity({
      type: 'plan',
      canonicalId: 'plan:0001',
      name: 'Plan 1',
      metadata: {},
    });
    storage.upsertEntity({
      type: 'agent',
      canonicalId: 'agent:0001#001',
      name: 'Agent 1',
      metadata: {},
    });

    const result = graphHealth(config, db!);

    expect(result.stats.totalEntities).toBe(2);
    expect(result.stats.entityCounts.plan).toBe(1);
    expect(result.stats.entityCounts.agent).toBe(1);
  });

  describe('renderGraphHealth', () => {
    it('renders health summary as text', () => {
      const result = graphHealth(config, db!);
      const output = renderGraphHealth(result);

      expect(output).toContain('Knowledge Graph Health');
      expect(output).toContain('Entities: 0');
      expect(output).toContain('No conflicts detected.');
    });
  });
});
