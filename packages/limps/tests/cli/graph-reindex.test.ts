import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, unlinkSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { createGraphSchema } from '../../src/graph/schema.js';
import { graphReindex } from '../../src/cli/graph-reindex.js';
import type { ServerConfig } from '../../src/config.js';
import { EntityExtractor } from '../../src/graph/extractor.js';

describe('graphReindex', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let plansDir: string;

  beforeEach(() => {
    const base = join(tmpdir(), `test-graph-reindex-${Date.now()}`);
    mkdirSync(base, { recursive: true });
    dbPath = join(base, 'graph.sqlite');
    plansDir = join(base, 'plans');
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
    if (existsSync(plansDir)) {
      rmSync(plansDir, { recursive: true, force: true });
    }
  });

  function createConfig(): ServerConfig {
    return {
      plansPath: plansDir,
      dataPath: join(tmpdir(), 'data'),
      scoring: { weights: { dependency: 40, priority: 30, workload: 30 }, biases: {} },
    };
  }

  it('returns zero counts when no plans exist', () => {
    mkdirSync(plansDir, { recursive: true });
    const result = graphReindex(createConfig(), db!);

    expect(result.plansProcessed).toBe(0);
    expect(result.entitiesUpserted).toBe(0);
  });

  it('indexes a plan directory', () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    writeFileSync(
      join(planDir, '0001-test-plan-plan.md'),
      '---\ntitle: Test Plan\nstatus: WIP\n---\n# Test Plan\n'
    );

    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, '000-setup.agent.md'),
      '---\ntitle: Setup\nstatus: GAP\n---\n# Agent 000: Setup\n'
    );

    const result = graphReindex(createConfig(), db!);

    expect(result.plansProcessed).toBe(1);
    expect(result.entitiesUpserted).toBeGreaterThan(0);
  });

  it('filters by plan ID', () => {
    const plan1 = join(plansDir, '0001-first');
    const plan2 = join(plansDir, '0002-second');
    mkdirSync(plan1, { recursive: true });
    mkdirSync(plan2, { recursive: true });
    writeFileSync(join(plan1, '0001-first-plan.md'), '# Plan 1\n');
    writeFileSync(join(plan2, '0002-second-plan.md'), '# Plan 2\n');

    const result = graphReindex(createConfig(), db!, { planId: '0001' });

    expect(result.plansProcessed).toBe(1);
  });

  it('keeps relationship remapping scoped per extraction when local IDs collide', () => {
    const plan1 = join(plansDir, '0001-first');
    const plan2 = join(plansDir, '0002-second');
    mkdirSync(plan1, { recursive: true });
    mkdirSync(plan2, { recursive: true });
    writeFileSync(join(plan1, '0001-first-plan.md'), '# Plan 1\n');
    writeFileSync(join(plan2, '0002-second-plan.md'), '# Plan 2\n');

    const now = new Date().toISOString();
    const extractSpy = vi
      .spyOn(EntityExtractor.prototype, 'extractPlan')
      .mockImplementation((dir) => {
        const isFirst = dir.includes('0001-first');
        const planId = isFirst ? '0001' : '0002';
        return {
          warnings: [],
          entities: [
            {
              id: 1,
              type: 'plan',
              canonicalId: `plan:${planId}`,
              name: `Plan ${planId}`,
              sourcePath: join(dir, `${planId}-plan.md`),
              metadata: {},
              createdAt: now,
              updatedAt: now,
            },
            {
              id: 2,
              type: 'agent',
              canonicalId: `agent:${planId}#000`,
              name: `Agent ${planId}#000`,
              sourcePath: join(dir, 'agents/000-agent.md'),
              metadata: {},
              createdAt: now,
              updatedAt: now,
            },
          ],
          relationships: [
            {
              id: 1,
              sourceId: 1,
              targetId: 2,
              relationType: 'CONTAINS',
              confidence: 1,
              metadata: {},
              createdAt: now,
            },
          ],
        };
      });

    try {
      const result = graphReindex(createConfig(), db!);
      expect(result.entitiesUpserted).toBe(4);
      expect(result.relationshipsUpserted).toBe(2);

      const rows = db!
        .prepare(
          `
            SELECT se.canonical_id AS source, te.canonical_id AS target
            FROM relationships r
            JOIN entities se ON se.id = r.source_id
            JOIN entities te ON te.id = r.target_id
            ORDER BY source, target
          `
        )
        .all() as { source: string; target: string }[];

      expect(rows).toEqual([
        { source: 'plan:0001', target: 'agent:0001#000' },
        { source: 'plan:0002', target: 'agent:0002#000' },
      ]);
    } finally {
      extractSpy.mockRestore();
    }
  });
});
