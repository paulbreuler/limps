import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { createGraphSchema } from '../../src/graph/schema.js';
import { graphCheck } from '../../src/cli/graph-check.js';
import type { ServerConfig } from '../../src/config.js';

describe('graphCheck', () => {
  let dbPath: string;
  let db: Database.Database | null = null;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-graph-check-${Date.now()}.sqlite`);
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

  it('returns no conflicts for empty graph', () => {
    const result = graphCheck(config, db!);

    expect(result.conflicts).toHaveLength(0);
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(0);
    expect(result.checkedType).toBe('all');
  });

  it('checks specific conflict type', () => {
    const result = graphCheck(config, db!, { type: 'file_contention' });

    expect(result.conflicts).toHaveLength(0);
    expect(result.checkedType).toBe('file_contention');
  });

  it('checks all types by default', () => {
    const result = graphCheck(config, db!);
    expect(result.checkedType).toBe('all');
  });
});
