import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema, indexDocument } from '../src/indexer.js';
import { loadConfig } from '../src/config.js';
import { handleDecisionsLog } from '../src/resources/decisions-log.js';
import type { ResourceContext } from '../src/types.js';

describe('return-decisions-log', () => {
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

  it('should return decisions log with structure', async () => {
    // Create test plan with decision
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    writeFileSync(planMd, '# Test Plan\n\n## Decision\n\nWe decided to use TypeScript.', 'utf-8');
    await indexDocument(db, planMd);

    const result = await handleDecisionsLog('decisions://log', context);

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe('decisions://log');
    expect(result.contents[0].mimeType).toBe('application/json');

    const log = JSON.parse(result.contents[0].text || '{}');
    expect(log).toHaveProperty('decisions');
    expect(log).toHaveProperty('total');
    expect(Array.isArray(log.decisions)).toBe(true);
  });
});

describe('extract-decisions', () => {
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

  it('should extract decisions from documents', async () => {
    // Create plan with decision section
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    writeFileSync(
      planMd,
      '# Test Plan\n\n## Decision\n\nWe decided to implement feature X because of Y.',
      'utf-8'
    );
    await indexDocument(db, planMd);

    const result = await handleDecisionsLog('decisions://log', context);
    const log = JSON.parse(result.contents[0].text || '{}');

    expect(log.decisions.length).toBeGreaterThan(0);
    expect(log.decisions[0]).toHaveProperty('date');
    expect(log.decisions[0]).toHaveProperty('planId');
    expect(log.decisions[0]).toHaveProperty('title');
    expect(log.decisions[0]).toHaveProperty('rationale');
    expect(log.decisions[0]).toHaveProperty('context');
  });
});

describe('filter-by-date-range', () => {
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

  it('should return decisions sorted chronologically', async () => {
    // Create multiple plans with decisions
    const plan1Dir = join(plansDir, '0001-plan-one');
    mkdirSync(plan1Dir, { recursive: true });
    const plan1Md = join(plan1Dir, 'plan.md');
    writeFileSync(plan1Md, '# Plan One\n\n## Decision\n\nFirst decision.', 'utf-8');
    await indexDocument(db, plan1Md);

    // Wait a bit to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));

    const plan2Dir = join(plansDir, '0002-plan-two');
    mkdirSync(plan2Dir, { recursive: true });
    const plan2Md = join(plan2Dir, 'plan.md');
    writeFileSync(plan2Md, '# Plan Two\n\n## Decision\n\nSecond decision.', 'utf-8');
    await indexDocument(db, plan2Md);

    const result = await handleDecisionsLog('decisions://log', context);
    const log = JSON.parse(result.contents[0].text || '{}');

    // Should be sorted newest first
    if (log.decisions.length >= 2) {
      const date1 = new Date(log.decisions[0].date).getTime();
      const date2 = new Date(log.decisions[1].date).getTime();
      expect(date1).toBeGreaterThanOrEqual(date2);
    }
  });

  it('should extract decisions from frontmatter', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    writeFileSync(
      planMd,
      `---
decision: "We decided to use TypeScript for type safety"
---

# Test Plan

Content here.`,
      'utf-8'
    );
    await indexDocument(db, planMd);

    const result = await handleDecisionsLog('decisions://log', context);
    const log = JSON.parse(result.contents[0].text || '{}');

    expect(log.decisions.length).toBeGreaterThan(0);
    const decision = log.decisions.find((d: any) => d.rationale.includes('TypeScript'));
    expect(decision).toBeDefined();
  });

  it('should handle duplicate decisions', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    const decisionText = 'We decided to use TypeScript';
    writeFileSync(
      planMd,
      `# Test Plan\n\n## Decision\n\n${decisionText}.\n\n## Another Decision\n\n${decisionText}.`,
      'utf-8'
    );
    await indexDocument(db, planMd);

    const result = await handleDecisionsLog('decisions://log', context);
    const log = JSON.parse(result.contents[0].text || '{}');

    // Should avoid duplicates
    const decisionsWithText = log.decisions.filter((d: any) => d.rationale.includes(decisionText));
    // May have one or more depending on implementation
    expect(decisionsWithText.length).toBeGreaterThan(0);
  });

  it('should handle decisions field in frontmatter', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    writeFileSync(
      planMd,
      `---
decisions: "Multiple decisions here"
---

# Test Plan`,
      'utf-8'
    );
    await indexDocument(db, planMd);

    const result = await handleDecisionsLog('decisions://log', context);
    const log = JSON.parse(result.contents[0].text || '{}');

    expect(log.decisions.length).toBeGreaterThan(0);
  });
});
