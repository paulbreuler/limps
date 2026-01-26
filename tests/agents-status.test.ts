import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import { loadConfig } from '../src/config.js';
import { handleAgentsStatus } from '../src/resources/agents-status.js';
import type { ResourceContext } from '../src/types.js';

describe('agents-status', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let context: ResourceContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');

    mkdirSync(plansDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = loadConfig(join(testDir, 'config.json'));
    config.plansPath = plansDir;

    context = {
      db,
      config,
    };
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return empty agents status (coordination removed)', async () => {
    const result = await handleAgentsStatus('agents://status', context);

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe('agents://status');
    expect(result.contents[0].mimeType).toBe('application/json');

    const status = JSON.parse(result.contents[0].text || '{}');
    expect(status).toHaveProperty('agents');
    expect(status).toHaveProperty('totalAgents');
    expect(status).toHaveProperty('activeAgents');
    expect(Array.isArray(status.agents)).toBe(true);
    expect(status.agents).toHaveLength(0);
    expect(status.totalAgents).toBe(0);
    expect(status.activeAgents).toBe(0);
  });
});
