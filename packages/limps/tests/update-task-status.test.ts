import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema, indexDocument } from '../src/indexer.js';
import { loadConfig } from '../src/config.js';
import { handleUpdateTaskStatus } from '../src/tools/update-task-status.js';
import type { ToolContext } from '../src/types.js';

describe('update-status-gap-to-wip', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let planDir: string;
  let planFile: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    planDir = join(plansDir, '0001-test-plan');
    planFile = join(planDir, 'plan.md');

    mkdirSync(planDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    // Create plan document with GAP status
    const planContent = `# Test Plan

### #1: Test Feature

Status: \`GAP\`
Dependencies: None
`;
    writeFileSync(planFile, planContent, 'utf-8');
    await indexDocument(db, planFile);

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

  it('should update status from GAP to WIP', async () => {
    const result = await handleUpdateTaskStatus(
      { taskId: '0001-test-plan#1', status: 'WIP' },
      context
    );

    expect(result.isError).toBeFalsy();

    // Verify document was updated
    const updatedContent = readFileSync(planFile, 'utf-8');
    expect(updatedContent).toContain('Status: `WIP`');
    expect(updatedContent).not.toContain('Status: `GAP`');
  });
});

describe('validate-transitions', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let planDir: string;
  let planFile: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    planDir = join(plansDir, '0001-test-plan');
    planFile = join(planDir, 'plan.md');

    mkdirSync(planDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    // Create plan document with WIP status
    const planContent = `# Test Plan

### #1: Test Feature

Status: \`WIP\`
Dependencies: None
`;
    writeFileSync(planFile, planContent, 'utf-8');
    await indexDocument(db, planFile);

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

  it('should reject invalid transition', async () => {
    // Try to go from WIP to GAP (invalid)
    const result = await handleUpdateTaskStatus(
      { taskId: '0001-test-plan#1', status: 'GAP' },
      context
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid status transition');
  });

  it('should allow valid WIP to PASS transition', async () => {
    const result = await handleUpdateTaskStatus(
      { taskId: '0001-test-plan#1', status: 'PASS' },
      context
    );

    expect(result.isError).toBeFalsy();

    // Verify document was updated
    const updatedContent = readFileSync(planFile, 'utf-8');
    expect(updatedContent).toContain('Status: `PASS`');
  });
});

describe('handle-invalid-task', () => {
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

  it('should handle invalid task ID', async () => {
    const result = await handleUpdateTaskStatus(
      { taskId: 'nonexistent-plan#999', status: 'WIP' },
      context
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });
});
