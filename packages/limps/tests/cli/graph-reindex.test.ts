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

  it('remaps extractor-local relationship IDs to persisted entity IDs', () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    writeFileSync(join(planDir, '0001-test-plan-plan.md'), '# Plan 1\n');

    const now = new Date().toISOString();
    const extractSpy = vi.spyOn(EntityExtractor.prototype, 'extractPlan').mockReturnValue({
      warnings: [],
      entities: [
        {
          id: 101,
          type: 'plan',
          canonicalId: 'plan:0001',
          name: 'Plan 0001',
          sourcePath: join(planDir, '0001-test-plan-plan.md'),
          metadata: {},
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 202,
          type: 'agent',
          canonicalId: 'agent:0001#000',
          name: 'Agent 000',
          sourcePath: join(planDir, 'agents/000-agent.md'),
          metadata: {},
          createdAt: now,
          updatedAt: now,
        },
      ],
      relationships: [
        {
          id: 1,
          sourceId: 101,
          targetId: 202,
          relationType: 'CONTAINS',
          confidence: 1,
          metadata: {},
          createdAt: now,
        },
      ],
    });

    try {
      const result = graphReindex(createConfig(), db!);
      expect(result.entitiesUpserted).toBe(2);
      expect(result.relationshipsUpserted).toBe(1);

      const relRow = db!.prepare('SELECT source_id, target_id FROM relationships LIMIT 1').get() as
        | { source_id: number; target_id: number }
        | undefined;
      expect(relRow).toBeDefined();
      expect(relRow?.source_id).toBe(1);
      expect(relRow?.target_id).toBe(2);
    } finally {
      extractSpy.mockRestore();
    }
  });
});
