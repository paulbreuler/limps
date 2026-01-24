import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  unlinkSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
  readFileSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import { readCoordination } from '../src/coordination.js';
import { loadConfig } from '../src/config.js';
import { handleCreatePlan } from '../src/tools/create-plan.js';
import type { ToolContext } from '../src/types.js';

describe('create-plan-valid', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    coordinationPath = join(testDir, 'coordination.json');

    mkdirSync(plansDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = plansDir;

    const coordination = await readCoordination(coordinationPath);

    context = {
      db,
      coordination,
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

  it('should create plan with valid name', async () => {
    const result = await handleCreatePlan({ name: 'test-plan' }, context);

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('test-plan');

    // Verify directory structure
    const planDirs = readdirSync(plansDir);
    const planDir = planDirs.find((d) => d.includes('test-plan'));
    expect(planDir).toBeDefined();

    const planPath = join(plansDir, planDir!);
    expect(existsSync(join(planPath, 'plan.md'))).toBe(true);
  });
});

describe('next-plan-number', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    coordinationPath = join(testDir, 'coordination.json');

    mkdirSync(plansDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = plansDir;

    const coordination = await readCoordination(coordinationPath);

    context = {
      db,
      coordination,
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

  it('should determine next plan number', async () => {
    // Create existing plans with different numbering formats
    mkdirSync(join(plansDir, '0001-first-plan'), { recursive: true });
    mkdirSync(join(plansDir, '2-second-plan'), { recursive: true });
    mkdirSync(join(plansDir, '0003-third-plan'), { recursive: true });

    const result = await handleCreatePlan({ name: 'new-plan' }, context);

    expect(result.isError).toBeFalsy();

    // Should create plan with number 4 (next after 1, 2, 3)
    const planDirs = readdirSync(plansDir);
    const newPlanDir = planDirs.find((d) => d.includes('new-plan'));
    expect(newPlanDir).toBeDefined();
    expect(newPlanDir).toMatch(/^0004-/);
  });
});

describe('reject-duplicate', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    coordinationPath = join(testDir, 'coordination.json');

    mkdirSync(plansDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = plansDir;

    const coordination = await readCoordination(coordinationPath);

    context = {
      db,
      coordination,
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

  it('should reject duplicate names', async () => {
    // Create existing plan
    mkdirSync(join(plansDir, '0001-existing-plan'), { recursive: true });

    const result = await handleCreatePlan({ name: 'existing-plan' }, context);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already exists');
  });
});

describe('template-replacement', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let coordinationPath: string;
  let context: ToolContext;
  let templateDir: string;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    coordinationPath = join(testDir, 'coordination.json');
    templateDir = join(testDir, '.mcp', 'server', 'templates');

    mkdirSync(plansDir, { recursive: true });
    mkdirSync(templateDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    // Create template file
    const templateContent = `# {{PLAN_NAME}}

Plan number: {{PLAN_NUMBER}}
Description: {{DESCRIPTION}}
`;
    writeFileSync(join(templateDir, 'plan.md'), templateContent, 'utf-8');

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = plansDir;

    const coordination = await readCoordination(coordinationPath);

    context = {
      db,
      coordination,
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

  it('should replace template placeholders', async () => {
    const result = await handleCreatePlan(
      { name: 'template-test', description: 'Test description' },
      context
    );

    expect(result.isError).toBeFalsy();

    // Verify template replacement
    const planDirs = readdirSync(plansDir);
    const planDir = planDirs.find((d) => d.includes('template-test'));
    expect(planDir).toBeDefined();

    const planPath = join(plansDir, planDir!);
    const planContent = readFileSync(join(planPath, 'plan.md'), 'utf-8');
    expect(planContent).toContain('template-test');
    expect(planContent).toContain('Test description');
    expect(planContent).not.toContain('{{PLAN_NAME}}');
    expect(planContent).not.toContain('{{DESCRIPTION}}');
  });
});
