import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import { createTestConfig } from './test-config-helper.js';
import { handlePlanFull } from '../src/resources/plans-full.js';
import type { ResourceContext } from '../src/types.js';

describe('return-full-plan', () => {
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
      unlinkSync(dbPath);
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return full plan content', async () => {
    // Create test plan
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    const planContent =
      '# Test Plan\n\nThis is the full plan content.\n\n## Section 1\n\nDetails here.';
    writeFileSync(planMd, planContent, 'utf-8');

    const result = await handlePlanFull('plans://full/0001-test-plan', context);

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe('plans://full/0001-test-plan');
    expect(result.contents[0].mimeType).toBe('text/markdown');
    expect(result.contents[0].text).toBe(planContent);
  });
});

describe('handle-missing-plan', () => {
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
      unlinkSync(dbPath);
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return error for missing plan', async () => {
    const result = await handlePlanFull('plans://full/nonexistent-plan', context);

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toContain('Plan not found');
  });
});

describe('return-large-plans', () => {
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
      unlinkSync(dbPath);
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return large plan content', async () => {
    // Create large plan
    const planDir = join(plansDir, '0001-large-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');

    // Create content with ~10KB
    const largeContent = '# Large Plan\n\n' + 'This is a large plan. '.repeat(500);
    writeFileSync(planMd, largeContent, 'utf-8');

    const result = await handlePlanFull('plans://full/0001-large-plan', context);

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toBe(largeContent);
    expect(result.contents[0].text.length).toBeGreaterThan(1000);
  });
});
