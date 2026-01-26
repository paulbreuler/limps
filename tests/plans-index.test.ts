import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema, indexDocument } from '../src/indexer.js';
import { loadConfig } from '../src/config.js';
import { handlePlansIndex } from '../src/resources/plans-index.js';
import type { ResourceContext } from '../src/types.js';

describe('return-plan-index', () => {
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

  it('should return plan index with structure', async () => {
    // Create test plans
    const plan1Dir = join(plansDir, '0001-test-plan');
    mkdirSync(plan1Dir, { recursive: true });
    const plan1Md = join(plan1Dir, 'plan.md');
    writeFileSync(plan1Md, '# Test Plan One\n\nDescription', 'utf-8');
    await indexDocument(db, plan1Md);

    const plan2Dir = join(plansDir, '0002-another-plan');
    mkdirSync(plan2Dir, { recursive: true });
    const plan2Md = join(plan2Dir, 'plan.md');
    writeFileSync(plan2Md, '# Test Plan Two\n\nDescription', 'utf-8');
    await indexDocument(db, plan2Md);

    const result = await handlePlansIndex('plans://index', context);

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe('plans://index');
    expect(result.contents[0].mimeType).toBe('application/json');

    const index = JSON.parse(result.contents[0].text || '{}');
    expect(index).toHaveProperty('plans');
    expect(index).toHaveProperty('totalPlans');
    expect(index).toHaveProperty('totalTasks');
    expect(index).toHaveProperty('completedTasks');
    expect(Array.isArray(index.plans)).toBe(true);
    expect(index.totalPlans).toBeGreaterThanOrEqual(2);
  });

  it('should return empty index when no plans exist', async () => {
    const result = await handlePlansIndex('plans://index', context);

    expect(result.contents).toHaveLength(1);
    const index = JSON.parse(result.contents[0].text || '{}');
    expect(index.plans).toEqual([]);
    expect(index.totalPlans).toBe(0);
    expect(index.totalTasks).toBe(0);
    expect(index.completedTasks).toBe(0);
  });
});

describe('include-status-summary', () => {
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

  it('should include status summary in plan index', async () => {
    // Create plan with status in frontmatter
    const plan1Dir = join(plansDir, '0001-wip-plan');
    mkdirSync(plan1Dir, { recursive: true });
    const plan1Md = join(plan1Dir, 'plan.md');
    writeFileSync(plan1Md, '---\nstatus: WIP\n---\n# WIP Plan\n\nDescription', 'utf-8');
    await indexDocument(db, plan1Md);

    const plan2Dir = join(plansDir, '0002-pass-plan');
    mkdirSync(plan2Dir, { recursive: true });
    const plan2Md = join(plan2Dir, 'plan.md');
    writeFileSync(plan2Md, '---\nstatus: PASS\n---\n# Pass Plan\n\nDescription', 'utf-8');
    await indexDocument(db, plan2Md);

    const result = await handlePlansIndex('plans://index', context);
    const index = JSON.parse(result.contents[0].text || '{}');

    expect(index.plans.length).toBeGreaterThanOrEqual(2);

    const wipPlan = index.plans.find((p: { id: string }) => p.id === '0001-wip-plan');
    expect(wipPlan).toBeDefined();
    expect(wipPlan.status).toBe('WIP');

    const passPlan = index.plans.find((p: { id: string }) => p.id === '0002-pass-plan');
    expect(passPlan).toBeDefined();
    expect(passPlan.status).toBe('PASS');
  });
});

describe('sort-by-plan-number', () => {
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

  it('should sort plans by plan number numerically', async () => {
    // Create plans in non-sequential order
    const plan10Dir = join(plansDir, '0010-plan-ten');
    mkdirSync(plan10Dir, { recursive: true });
    const plan10Md = join(plan10Dir, 'plan.md');
    writeFileSync(plan10Md, '# Plan Ten', 'utf-8');
    await indexDocument(db, plan10Md);

    const plan2Dir = join(plansDir, '0002-plan-two');
    mkdirSync(plan2Dir, { recursive: true });
    const plan2Md = join(plan2Dir, 'plan.md');
    writeFileSync(plan2Md, '# Plan Two', 'utf-8');
    await indexDocument(db, plan2Md);

    const plan1Dir = join(plansDir, '0001-plan-one');
    mkdirSync(plan1Dir, { recursive: true });
    const plan1Md = join(plan1Dir, 'plan.md');
    writeFileSync(plan1Md, '# Plan One', 'utf-8');
    await indexDocument(db, plan1Md);

    const result = await handlePlansIndex('plans://index', context);
    const index = JSON.parse(result.contents[0].text || '{}');

    expect(index.plans.length).toBeGreaterThanOrEqual(3);

    // Verify sorted order
    const planNumbers = index.plans.map((p: { id: string }) => {
      const match = p.id.match(/^0*(\d+)-/);
      return match ? parseInt(match[1], 10) : 0;
    });

    for (let i = 1; i < planNumbers.length; i++) {
      expect(planNumbers[i]).toBeGreaterThanOrEqual(planNumbers[i - 1]);
    }

    // Verify first plan is 0001
    expect(index.plans[0].id).toMatch(/^0001-/);
  });
});
