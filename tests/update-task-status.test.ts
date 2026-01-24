import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema, indexDocument } from '../src/indexer.js';
import { readCoordination, writeCoordination } from '../src/coordination.js';
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
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    planDir = join(plansDir, '0001-test-plan');
    planFile = join(planDir, 'plan.md');
    coordinationPath = join(testDir, 'coordination.json');

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
    config.coordinationPath = coordinationPath;
    config.plansPath = plansDir;

    const coordination = await readCoordination(coordinationPath);
    // Add task to coordination
    coordination.tasks['0001-test-plan#1'] = {
      status: 'GAP',
      dependencies: [],
    };
    await writeCoordination(coordinationPath, coordination, coordination.version);

    context = {
      db,
      coordination: await readCoordination(coordinationPath),
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
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    planDir = join(plansDir, '0001-test-plan');
    planFile = join(planDir, 'plan.md');
    coordinationPath = join(testDir, 'coordination.json');

    mkdirSync(planDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const planContent = `# Test Plan

### #1: Test Feature

Status: \`GAP\`
Dependencies: None
`;
    writeFileSync(planFile, planContent, 'utf-8');
    await indexDocument(db, planFile);

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = plansDir;

    const coordination = await readCoordination(coordinationPath);
    coordination.tasks['0001-test-plan#1'] = {
      status: 'GAP',
      dependencies: [],
    };
    await writeCoordination(coordinationPath, coordination, coordination.version);

    context = {
      db,
      coordination: await readCoordination(coordinationPath),
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

  it('should reject invalid transitions', async () => {
    // GAP -> PASS is invalid (must go through WIP)
    const result = await handleUpdateTaskStatus(
      { taskId: '0001-test-plan#1', status: 'PASS' },
      context
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid status transition');
  });

  it('should allow valid transitions', async () => {
    // GAP -> WIP is valid
    const result1 = await handleUpdateTaskStatus(
      { taskId: '0001-test-plan#1', status: 'WIP' },
      context
    );
    expect(result1.isError).toBeFalsy();

    // Update context with new status - need to actually update coordination first
    const updatedCoordination = await readCoordination(coordinationPath);
    updatedCoordination.tasks['0001-test-plan#1'].status = 'WIP';
    await writeCoordination(coordinationPath, updatedCoordination, updatedCoordination.version);
    context.coordination = await readCoordination(coordinationPath);

    // WIP -> PASS is valid
    const result2 = await handleUpdateTaskStatus(
      { taskId: '0001-test-plan#1', status: 'PASS' },
      context
    );
    expect(result2.isError).toBeFalsy();
  });
});

describe('update-with-claim', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let planDir: string;
  let planFile: string;
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    planDir = join(plansDir, '0001-test-plan');
    planFile = join(planDir, 'plan.md');
    coordinationPath = join(testDir, 'coordination.json');

    mkdirSync(planDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const planContent = `# Test Plan

### #1: Test Feature

Status: \`GAP\`
Dependencies: None
`;
    writeFileSync(planFile, planContent, 'utf-8');
    await indexDocument(db, planFile);

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = plansDir;

    const coordination = await readCoordination(coordinationPath);
    coordination.tasks['0001-test-plan#1'] = {
      status: 'GAP',
      dependencies: [],
    };
    await writeCoordination(coordinationPath, coordination, coordination.version);

    context = {
      db,
      coordination: await readCoordination(coordinationPath),
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

  it('should update status and coordination with agent claim', async () => {
    const result = await handleUpdateTaskStatus(
      { taskId: '0001-test-plan#1', status: 'WIP', agentId: 'agent-123' },
      context
    );

    expect(result.isError).toBeFalsy();

    // Verify coordination was updated
    const updatedCoordination = await readCoordination(coordinationPath);
    const task = updatedCoordination.tasks['0001-test-plan#1'];
    expect(task.status).toBe('WIP');
    expect(task.claimedBy).toBe('agent-123');
  });
});

describe('handle-invalid-task', () => {
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

  it('should handle invalid task ID', async () => {
    const result = await handleUpdateTaskStatus(
      { taskId: 'nonexistent-plan#999', status: 'WIP' },
      context
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });
});

describe('update-task-status-auto-creation', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let planDir: string;
  let planFile: string;
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    planDir = join(plansDir, '0001-test-plan');
    planFile = join(planDir, 'plan.md');
    coordinationPath = join(testDir, 'coordination.json');

    mkdirSync(planDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    // Create plan document with GAP status
    const planContent = `# Test Plan

### #1: Test Feature

Status: \`GAP\`
Dependencies: None

### #2: Second Feature

Status: \`GAP\`
Dependencies: #1
`;
    writeFileSync(planFile, planContent, 'utf-8');
    await indexDocument(db, planFile);

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = plansDir;

    // Initialize empty coordination state (no tasks pre-created)
    const coordination = await readCoordination(coordinationPath);
    // Do NOT add tasks - testing auto-creation

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

  it('should auto-create task when exists in plan but not in coordination', async () => {
    // Verify task does not exist in coordination
    const beforeState = await readCoordination(coordinationPath);
    expect(beforeState.tasks['0001-test-plan#1']).toBeUndefined();

    // Update task status (should auto-create from plan)
    const result = await handleUpdateTaskStatus(
      { taskId: '0001-test-plan#1', status: 'WIP', agentId: 'agent-1' },
      context
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain('status updated');

    // Verify task was created and updated
    const afterState = await readCoordination(coordinationPath);
    expect(afterState.tasks['0001-test-plan#1']).toBeDefined();
    expect(afterState.tasks['0001-test-plan#1']?.status).toBe('WIP');
    expect(afterState.tasks['0001-test-plan#1']?.claimedBy).toBe('agent-1');

    // Verify document was updated
    const updatedContent = readFileSync(planFile, 'utf-8');
    expect(updatedContent).toContain('Status: `WIP`');
  });

  it('should fail gracefully when task does not exist in plan or coordination', async () => {
    const result = await handleUpdateTaskStatus(
      { taskId: '0001-test-plan#999', status: 'WIP' },
      context
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('not found');
  });

  it('should fail gracefully when plan document does not exist', async () => {
    const result = await handleUpdateTaskStatus(
      { taskId: '9999-nonexistent#1', status: 'WIP' },
      context
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('not found');
  });
});
