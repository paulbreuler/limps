import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { createGraphSchema } from '../../src/graph/schema.js';
import { GraphStorage } from '../../src/graph/storage.js';
import type { ToolContext } from '../../src/types.js';
import type { ServerConfig } from '../../src/config.js';
import { handleGraph } from '../../src/tools/graph.js';

describe('Graph MCP Tool (unified)', () => {
  let dataDir: string;
  let plansDir: string;
  let db: Database.Database | null = null;
  let context: ToolContext;

  beforeEach(() => {
    const base = join(tmpdir(), `test-graph-tools-${Date.now()}`);
    mkdirSync(base, { recursive: true });
    dataDir = join(base, 'data');
    plansDir = join(base, 'plans');
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const dbPath = join(dataDir, 'graph.sqlite');
    db = new Database(dbPath);
    createGraphSchema(db);

    const config: ServerConfig = {
      plansPath: plansDir,
      dataPath: dataDir,
      scoring: { weights: { dependency: 40, priority: 30, workload: 30 }, biases: {} },
    };

    context = { db: db!, config };
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    const base = join(dataDir, '..');
    if (existsSync(base)) {
      rmSync(base, { recursive: true, force: true });
    }
  });

  function parseResult(result: Awaited<ReturnType<typeof handleGraph>>): unknown {
    return JSON.parse(result.content[0]!.text);
  }

  describe('health', () => {
    it('returns graph stats', async () => {
      const result = await handleGraph({ command: 'health' }, context);
      const data = parseResult(result) as Record<string, unknown>;

      expect(data).toHaveProperty('stats');
      expect(data).toHaveProperty('summary');
    });
  });

  describe('search', () => {
    it('searches graph entities', async () => {
      const result = await handleGraph({ command: 'search', query: 'test' }, context);
      const data = parseResult(result) as { query: string; results: unknown[] };

      expect(data.query).toBe('test');
      expect(data.results).toEqual([]);
    });

    it('returns error when query is missing', async () => {
      const result = await handleGraph({ command: 'search' }, context);

      expect(result.isError).toBe(true);
    });
  });

  describe('trace', () => {
    it('traces entity relationships', async () => {
      const storage = new GraphStorage(db!);
      storage.upsertEntity({
        type: 'plan',
        canonicalId: 'plan:0001',
        name: 'Plan 1',
        metadata: {},
      });

      const result = await handleGraph({ command: 'trace', entityId: 'plan:0001' }, context);
      const data = parseResult(result) as { root: { canonicalId: string } };

      expect(data.root.canonicalId).toBe('plan:0001');
    });

    it('returns error when entityId is missing', async () => {
      const result = await handleGraph({ command: 'trace' }, context);

      expect(result.isError).toBe(true);
    });
  });

  describe('entity', () => {
    it('returns entity details', async () => {
      const storage = new GraphStorage(db!);
      storage.upsertEntity({
        type: 'plan',
        canonicalId: 'plan:0001',
        name: 'Plan 1',
        metadata: {},
      });

      const result = await handleGraph({ command: 'entity', entityId: 'plan:0001' }, context);
      const data = parseResult(result) as { entity: { name: string } };

      expect(data.entity.name).toBe('Plan 1');
    });
  });

  describe('overlap', () => {
    it('returns overlap results', async () => {
      const result = await handleGraph({ command: 'overlap' }, context);
      const data = parseResult(result) as { totalFeatures: number };

      expect(data.totalFeatures).toBe(0);
    });
  });

  describe('reindex', () => {
    it('reindexes plans', async () => {
      const planDir = join(plansDir, '0001-test');
      mkdirSync(planDir, { recursive: true });
      writeFileSync(join(planDir, '0001-test-plan.md'), '# Test Plan\n');

      const result = await handleGraph({ command: 'reindex' }, context);
      const data = parseResult(result) as { plansProcessed: number };

      expect(data.plansProcessed).toBe(1);
    });
  });

  describe('check', () => {
    it('checks for conflicts', async () => {
      const result = await handleGraph({ command: 'check' }, context);
      const data = parseResult(result) as { conflicts: unknown[]; checkedType: string };

      expect(data.conflicts).toEqual([]);
      expect(data.checkedType).toBe('all');
    });

    it('checks specific conflict type', async () => {
      const result = await handleGraph({ command: 'check', type: 'file_contention' }, context);
      const data = parseResult(result) as { checkedType: string };

      expect(data.checkedType).toBe('file_contention');
    });
  });

  describe('suggest', () => {
    it('returns consolidation suggestions', async () => {
      const result = await handleGraph({ command: 'suggest', type: 'consolidate' }, context);
      const data = parseResult(result) as { type: string; suggestions: string[] };

      expect(data.type).toBe('consolidate');
      expect(Array.isArray(data.suggestions)).toBe(true);
    });

    it('returns error for missing type', async () => {
      const result = await handleGraph({ command: 'suggest' }, context);

      expect(result.isError).toBe(true);
    });
  });
});
