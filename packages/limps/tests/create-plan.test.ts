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
import { createTestConfig } from './test-config-helper.js';
import { handleCreatePlan } from '../src/tools/create-plan.js';
import type { ToolContext } from '../src/types.js';

describe('create-plan-valid', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let context: ToolContext;

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

  it('should create plan with valid name', async () => {
    const result = await handleCreatePlan({ name: 'test-plan' }, context);

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('test-plan');

    // Verify directory structure
    const planDirs = readdirSync(plansDir);
    const planDir = planDirs.find((d) => d.includes('test-plan'));
    expect(planDir).toBeDefined();

    const planPath = join(plansDir, planDir!);
    // New naming format: {dirName}-plan.md
    expect(existsSync(join(planPath, `${planDir}-plan.md`))).toBe(true);
  });
});

describe('next-plan-number', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let context: ToolContext;

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
  let context: ToolContext;

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

  it('should reject duplicate names', async () => {
    // Create existing plan
    mkdirSync(join(plansDir, '0001-existing-plan'), { recursive: true });

    const result = await handleCreatePlan({ name: 'existing-plan' }, context);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already exists');
  });

  it('should use name as-is when it already has a number prefix (no double prefix)', async () => {
    const result = await handleCreatePlan(
      { name: '0042-limps-headless-pivot', description: 'Pivot plan' },
      context
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('0042-limps-headless-pivot');
    expect(result.content[0].text).not.toContain('0042-0042-');

    const planDirs = readdirSync(plansDir);
    expect(planDirs).toContain('0042-limps-headless-pivot');
    expect(planDirs.some((d) => d.startsWith('0042-0042-'))).toBe(false);
  });

  it('should reject duplicate when full directory name matches', async () => {
    mkdirSync(join(plansDir, '0042-limps-headless-pivot'), { recursive: true });

    const result = await handleCreatePlan({ name: '0042-limps-headless-pivot' }, context);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already exists');
  });
});

describe('template-replacement', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let context: ToolContext;
  let templateDir: string;
  let previousCwd: string;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    templateDir = join(testDir, 'templates');

    mkdirSync(plansDir, { recursive: true });
    mkdirSync(templateDir, { recursive: true });
    previousCwd = process.cwd();
    process.chdir(testDir);
    db = initializeDatabase(dbPath);
    createSchema(db);

    // Create template file
    const templateContent = `# {{PLAN_NAME}}

Plan number: {{PLAN_NUMBER}}
Description: {{DESCRIPTION}}
`;
    writeFileSync(join(templateDir, 'plan.md'), templateContent, 'utf-8');

    const config = createTestConfig(testDir);
    config.plansPath = plansDir;

    context = {
      db,
      config,
    };
  });

  afterEach(() => {
    process.chdir(previousCwd);
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
    // New naming format: {dirName}-plan.md
    const planContent = readFileSync(join(planPath, `${planDir}-plan.md`), 'utf-8');
    expect(planContent).toContain('template-test');
    expect(planContent).toContain('Test description');
    expect(planContent).not.toContain('{{PLAN_NAME}}');
    expect(planContent).not.toContain('{{DESCRIPTION}}');
  });

  it('should replace body placeholder in custom template', async () => {
    const templateContent = `# {{PLAN_NAME}}

## Overview
{{DESCRIPTION}}

## Body
{{BODY}}
`;
    writeFileSync(join(templateDir, 'plan.md'), templateContent, 'utf-8');

    const result = await handleCreatePlan(
      {
        name: 'body-placeholder-test',
        description: 'Body test description',
        body: '## Feature A\\n\\n- Validate command behavior',
      },
      context
    );

    expect(result.isError).toBeFalsy();

    const planDirs = readdirSync(plansDir);
    const planDir = planDirs.find((d) => d.includes('body-placeholder-test'));
    expect(planDir).toBeDefined();

    const planPath = join(plansDir, planDir!);
    const planContent = readFileSync(join(planPath, `${planDir}-plan.md`), 'utf-8');
    expect(planContent).toContain('## Feature A');
    expect(planContent).toContain('- Validate command behavior');
    expect(planContent).not.toContain('{{BODY}}');
  });

  it('should fail when body is provided but template has no BODY placeholder', async () => {
    const templateContent = `# {{PLAN_NAME}}

## Overview
{{DESCRIPTION}}

## Features
<!-- Features intentionally static -->
`;
    writeFileSync(join(templateDir, 'plan.md'), templateContent, 'utf-8');

    const result = await handleCreatePlan(
      {
        name: 'missing-body-placeholder',
        description: 'missing placeholder test',
        body: '## Injected Body\\n\\n- should require BODY placeholder',
      },
      context
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Template must include {{BODY}}');
  });
});

describe('body-content', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let context: ToolContext;

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

  it('should inject body content into the default template', async () => {
    const result = await handleCreatePlan(
      {
        name: 'body-default-template-test',
        body: '## Features\\n\\n- First command flow\\n- Second command flow',
      },
      context
    );

    expect(result.isError).toBeFalsy();

    const planDirs = readdirSync(plansDir);
    const planDir = planDirs.find((d) => d.includes('body-default-template-test'));
    expect(planDir).toBeDefined();

    const planPath = join(plansDir, planDir!);
    const planContent = readFileSync(join(planPath, `${planDir}-plan.md`), 'utf-8');
    expect(planContent).toContain('## Features');
    expect(planContent).toContain('- First command flow');
    expect(planContent).toContain('- Second command flow');
    expect(planContent).not.toContain('<!-- Features will be added here -->');
  });
});
