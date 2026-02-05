import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema, indexDocument } from '../src/indexer.js';
import { loadConfig } from '../src/config.js';
import { handlePlanSummary } from '../src/resources/plans-summary.js';
import type { ResourceContext } from '../src/types.js';

describe('return-plan-summary', () => {
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

  it('should return plan summary with structure', async () => {
    // Create test plan
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    writeFileSync(planMd, '# Test Plan\n\nThis is a test plan description.', 'utf-8');
    await indexDocument(db, planMd);

    const result = await handlePlanSummary('plans://summary/0001-test-plan', context);

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe('plans://summary/0001-test-plan');
    expect(result.contents[0].mimeType).toBe('application/json');

    const summary = JSON.parse(result.contents[0].text || '{}');
    expect(summary).toHaveProperty('id');
    expect(summary).toHaveProperty('title');
    expect(summary).toHaveProperty('description');
    expect(summary).toHaveProperty('status');
    expect(summary).toHaveProperty('tasks');
    expect(summary).toHaveProperty('dependencies');
    expect(summary).toHaveProperty('nextAction');
    expect(summary).toHaveProperty('taskCounts');
    expect(Array.isArray(summary.tasks)).toBe(true);
    expect(Array.isArray(summary.dependencies)).toBe(true);
  });
});

describe('include-task-breakdown', () => {
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

  it('should include task breakdown in summary', async () => {
    // Create test plan with agents
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    writeFileSync(planMd, '# Test Plan\n\nDescription', 'utf-8');
    await indexDocument(db, planMd);

    // Create agent files
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    writeFileSync(
      join(agentsDir, '001_agent_one.agent.md'),
      '---\nstatus: GAP\n---\n# Agent One\n',
      'utf-8'
    );
    writeFileSync(
      join(agentsDir, '002_agent_two.agent.md'),
      '---\nstatus: WIP\n---\n# Agent Two\n',
      'utf-8'
    );

    const result = await handlePlanSummary('plans://summary/0001-test-plan', context);
    const summary = JSON.parse(result.contents[0].text || '{}');

    expect(summary.tasks.length).toBeGreaterThanOrEqual(2);
    expect(summary.taskCounts.GAP).toBeGreaterThanOrEqual(1);
    expect(summary.taskCounts.WIP).toBeGreaterThanOrEqual(1);
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

  it('should return error for missing plan', async () => {
    const result = await handlePlanSummary('plans://summary/nonexistent-plan', context);

    expect(result.contents).toHaveLength(1);
    const error = JSON.parse(result.contents[0].text || '{}');
    expect(error).toHaveProperty('error');
    expect(error.error).toBe('Plan not found');
  });

  it('should return error for invalid URI format', async () => {
    const result = await handlePlanSummary('invalid-uri', context);

    expect(result.contents).toHaveLength(1);
    const error = JSON.parse(result.contents[0].text || '{}');
    expect(error).toHaveProperty('error');
    expect(error.error).toBe('Invalid URI format');
  });

  it('should return error for plan not indexed', async () => {
    // Create plan file but don't index it
    const planDir = join(plansDir, '0001-unindexed');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    writeFileSync(planMd, '# Unindexed Plan', 'utf-8');
    // Don't call indexDocument

    const result = await handlePlanSummary('plans://summary/0001-unindexed', context);

    expect(result.contents).toHaveLength(1);
    const error = JSON.parse(result.contents[0].text || '{}');
    expect(error).toHaveProperty('error');
    expect(error.error).toBe('Plan not indexed');
  });

  it('should suggest continuing WIP task in nextAction', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    writeFileSync(planMd, '# Test Plan\n\nDescription', 'utf-8');
    await indexDocument(db, planMd);

    // Create agent file with WIP status
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, '001_wip_agent.agent.md'),
      '---\nstatus: WIP\n---\n# WIP Agent\n',
      'utf-8'
    );

    const result = await handlePlanSummary('plans://summary/0001-test-plan', context);
    const summary = JSON.parse(result.contents[0].text || '{}');

    expect(summary.nextAction).toContain('Continue');
  });
});

describe('extract-dependencies', () => {
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

  it('should extract dependencies from frontmatter array', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    const content = `---
dependencies: ["#1", "#2", "feature-3"]
status: GAP
---
# Test Plan

Description`;
    writeFileSync(planMd, content, 'utf-8');
    await indexDocument(db, planMd);

    const result = await handlePlanSummary('plans://summary/0001-test-plan', context);
    const summary = JSON.parse(result.contents[0].text || '{}');

    expect(summary.dependencies).toContain('#1');
    expect(summary.dependencies).toContain('#2');
    expect(summary.dependencies).toContain('feature-3');
  });

  it('should extract dependencies from frontmatter string', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    const content = `---
dependencies: "#1"
status: GAP
---
# Test Plan

Description`;
    writeFileSync(planMd, content, 'utf-8');
    await indexDocument(db, planMd);

    const result = await handlePlanSummary('plans://summary/0001-test-plan', context);
    const summary = JSON.parse(result.contents[0].text || '{}');

    expect(summary.dependencies).toContain('#1');
  });

  it('should extract feature references from content', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    const content = `# Test Plan

Depends on: #1, #2, feature-3, feature_4
Related: #5`;
    writeFileSync(planMd, content, 'utf-8');
    await indexDocument(db, planMd);

    const result = await handlePlanSummary('plans://summary/0001-test-plan', context);
    const summary = JSON.parse(result.contents[0].text || '{}');

    expect(summary.dependencies.length).toBeGreaterThan(0);
    // Should extract #1, #2, feature-3, feature_4, #5
  });

  it('should deduplicate dependencies', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    const content = `---
dependencies: ["#1", "#1", "#2"]
---
# Test Plan

Also depends on #1 and #2`;
    writeFileSync(planMd, content, 'utf-8');
    await indexDocument(db, planMd);

    const result = await handlePlanSummary('plans://summary/0001-test-plan', context);
    const summary = JSON.parse(result.contents[0].text || '{}');

    // Should deduplicate
    const uniqueDeps = new Set(summary.dependencies);
    expect(uniqueDeps.size).toBeLessThanOrEqual(summary.dependencies.length);
  });
});

describe('extract-description', () => {
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

  it('should extract description from first paragraph', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    const content = `# Test Plan

This is the first paragraph that should be extracted as the description.

This is a second paragraph that should not be included.`;
    writeFileSync(planMd, content, 'utf-8');
    await indexDocument(db, planMd);

    const result = await handlePlanSummary('plans://summary/0001-test-plan', context);
    const summary = JSON.parse(result.contents[0].text || '{}');

    expect(summary.description).toContain('first paragraph');
    expect(summary.description.length).toBeLessThanOrEqual(200);
  });

  it('should skip markdown list items in description extraction', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    const content = `# Test Plan

- List item 1
- List item 2

This is the actual description paragraph.`;
    writeFileSync(planMd, content, 'utf-8');
    await indexDocument(db, planMd);

    const result = await handlePlanSummary('plans://summary/0001-test-plan', context);
    const summary = JSON.parse(result.contents[0].text || '{}');

    expect(summary.description).toContain('actual description');
    expect(summary.description).not.toContain('List item');
  });

  it('should return empty description if no paragraph found', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    const content = `# Test Plan

## Section 1
- Item 1
- Item 2

## Section 2
- Item 3`;
    writeFileSync(planMd, content, 'utf-8');
    await indexDocument(db, planMd);

    const result = await handlePlanSummary('plans://summary/0001-test-plan', context);
    const summary = JSON.parse(result.contents[0].text || '{}');

    // Should return empty or very short description
    expect(summary.description).toBeDefined();
  });
});

describe('task-counts', () => {
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

  it('should calculate task counts correctly', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    writeFileSync(planMd, '# Test Plan\n\nDescription', 'utf-8');
    await indexDocument(db, planMd);

    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    writeFileSync(
      join(agentsDir, '001_gap.agent.md'),
      '---\nstatus: GAP\n---\n# GAP Agent\n',
      'utf-8'
    );
    writeFileSync(
      join(agentsDir, '002_wip.agent.md'),
      '---\nstatus: WIP\n---\n# WIP Agent\n',
      'utf-8'
    );
    writeFileSync(
      join(agentsDir, '003_pass.agent.md'),
      '---\nstatus: PASS\n---\n# PASS Agent\n',
      'utf-8'
    );
    writeFileSync(
      join(agentsDir, '004_blocked.agent.md'),
      '---\nstatus: BLOCKED\n---\n# BLOCKED Agent\n',
      'utf-8'
    );

    const result = await handlePlanSummary('plans://summary/0001-test-plan', context);
    const summary = JSON.parse(result.contents[0].text || '{}');

    expect(summary.taskCounts.GAP).toBeGreaterThanOrEqual(1);
    expect(summary.taskCounts.WIP).toBeGreaterThanOrEqual(1);
    expect(summary.taskCounts.PASS).toBeGreaterThanOrEqual(1);
    expect(summary.taskCounts.BLOCKED).toBeGreaterThanOrEqual(1);
  });

  it('should suggest GAP task in nextAction when available', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    writeFileSync(planMd, '# Test Plan\n\nDescription', 'utf-8');
    await indexDocument(db, planMd);

    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    writeFileSync(
      join(agentsDir, '001_gap.agent.md'),
      '---\nstatus: GAP\n---\n# GAP Agent\n',
      'utf-8'
    );
    writeFileSync(
      join(agentsDir, '002_wip.agent.md'),
      '---\nstatus: WIP\n---\n# WIP Agent\n',
      'utf-8'
    );

    const result = await handlePlanSummary('plans://summary/0001-test-plan', context);
    const summary = JSON.parse(result.contents[0].text || '{}');

    // Should prioritize GAP over WIP
    expect(summary.nextAction).toContain('Work on');
  });

  it('should return all tasks complete when no GAP or WIP tasks', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const planMd = join(planDir, 'plan.md');
    writeFileSync(planMd, '# Test Plan\n\nDescription', 'utf-8');
    await indexDocument(db, planMd);

    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    writeFileSync(
      join(agentsDir, '001_pass.agent.md'),
      '---\nstatus: PASS\n---\n# PASS Agent\n',
      'utf-8'
    );

    const result = await handlePlanSummary('plans://summary/0001-test-plan', context);
    const summary = JSON.parse(result.contents[0].text || '{}');

    expect(summary.nextAction).toBe('All tasks complete');
  });
});
