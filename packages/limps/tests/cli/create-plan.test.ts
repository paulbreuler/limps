import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema } from '../../src/indexer.js';
import { createTestConfig } from '../test-config-helper.js';
import { handleCreatePlan } from '../../src/tools/create-plan.js';
import type { ToolContext } from '../../src/types.js';

describe('create-plan CLI command integration', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let context: ToolContext;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-db-create-plan-cli-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-cli-create-plan-${Date.now()}`);
    plansDir = join(testDir, 'plans');

    mkdirSync(plansDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = createTestConfig(testDir);
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
      try {
        unlinkSync(dbPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should create a plan successfully', async () => {
    const result = await handleCreatePlan(
      { name: 'my-test-plan', description: 'Test plan description' },
      context
    );

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.created).toBe(true);
    expect(payload.plan).toContain('my-test-plan');

    // Verify the plan directory was created
    const planDirs = readdirSync(plansDir);
    expect(planDirs.length).toBe(1);
    expect(planDirs[0]).toContain('my-test-plan');
  });

  it('should handle duplicate plan names (returns existing plan info by default)', async () => {
    // Create an existing plan directory
    mkdirSync(join(plansDir, '0001-existing-plan'), { recursive: true });

    const result = await handleCreatePlan(
      { name: 'existing-plan', templateName: 'default', ifExists: 'return' },
      context
    );

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.alreadyExists).toBe(true);
  });

  it('should auto-increment plan numbers', async () => {
    // Create existing plans
    mkdirSync(join(plansDir, '0001-first-plan'), { recursive: true });
    mkdirSync(join(plansDir, '0002-second-plan'), { recursive: true });

    const result = await handleCreatePlan(
      { name: 'third-plan', templateName: 'default', ifExists: 'return' },
      context
    );

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.created).toBe(true);

    // Verify the new plan has number 0003
    const planDirs = readdirSync(plansDir);
    const newPlan = planDirs.find((d) => d.includes('third-plan'));
    expect(newPlan).toBeDefined();
    expect(newPlan).toMatch(/^0003-third-plan$/);
  });

  it('should work without description option', async () => {
    const result = await handleCreatePlan(
      { name: 'simple-plan', templateName: 'default', ifExists: 'return' },
      context
    );

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.created).toBe(true);
    expect(payload.plan).toContain('simple-plan');
  });
});
