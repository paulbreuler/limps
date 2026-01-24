import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema, indexDocument } from '../src/indexer.js';
import { readCoordination, writeCoordination } from '../src/coordination.js';
import { loadConfig } from '../src/config.js';
import { handleGetNextTask } from '../src/tools/get-next-task.js';
import type { ToolContext } from '../src/types.js';

describe('return-highest-score', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans', '0008-test-plan');
    coordinationPath = join(testDir, 'coordination.json');

    mkdirSync(plansDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = join(testDir, 'plans');

    // Initialize coordination state (readCoordination creates it with version 1)
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

  it('should return highest scoring task', async () => {
    // Create plan document with multiple features
    const planContent = `# Test Plan

### #1: Feature One

Status: \`GAP\`
Dependencies: None
Files: \`src/file1.ts\`

### #2: Feature Two

Status: \`GAP\`
Dependencies: #1
Files: \`src/file2.ts\`

### #3: Feature Three

Status: \`GAP\`
Dependencies: None
Files: \`src/file3.ts\`
`;
    const planFile = join(plansDir, 'plan.md');
    writeFileSync(planFile, planContent, 'utf-8');
    await indexDocument(db!, planFile);

    // Mark feature #1 as PASS in coordination
    const coordination = await readCoordination(coordinationPath);
    coordination.tasks['0008-test-plan#1'] = {
      status: 'PASS',
      dependencies: [],
    };
    await writeCoordination(coordinationPath, coordination, coordination.version);

    // Update context
    context.coordination = await readCoordination(coordinationPath);

    // Request next task
    const result = await handleGetNextTask({ agentType: 'coder' }, context);

    expect(result.isError).toBeFalsy();
    const resultText = result.content[0]?.text || '';
    expect(resultText).toContain('0008-test-plan#2');
  });

  it('should break ties deterministically', async () => {
    // Create two plans with features
    const plan1Dir = join(testDir, 'plans', '0001-plan-a');
    const plan2Dir = join(testDir, 'plans', '0002-plan-b');
    mkdirSync(plan1Dir, { recursive: true });
    mkdirSync(plan2Dir, { recursive: true });

    const plan1Content = `# Plan A

### #1: Feature A

Status: \`GAP\`
Dependencies: None
Files: \`src/file-a.ts\`
`;
    const plan2Content = `# Plan B

### #1: Feature B

Status: \`GAP\`
Dependencies: None
Files: \`src/file-b.ts\`
`;

    writeFileSync(join(plan1Dir, 'plan.md'), plan1Content, 'utf-8');
    writeFileSync(join(plan2Dir, 'plan.md'), plan2Content, 'utf-8');
    await indexDocument(db!, join(plan1Dir, 'plan.md'));
    await indexDocument(db!, join(plan2Dir, 'plan.md'));

    // Both should have same score, but 0001 should win (lower plan number)
    const result = await handleGetNextTask({ agentType: 'coder' }, context);

    expect(result.isError).toBeFalsy();
    const resultText = result.content[0]?.text || '';
    expect(resultText).toContain('0001-plan-a#1');
  });
});

describe('score-dependencies', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans', '0008-test-plan');
    coordinationPath = join(testDir, 'coordination.json');

    mkdirSync(plansDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = join(testDir, 'plans');

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

  it('should give positive score when all dependencies PASS', async () => {
    const planContent = `# Test Plan

### #1: Feature One

Status: \`GAP\`
Dependencies: None
Files: \`src/file1.ts\`

### #2: Feature Two

Status: \`GAP\`
Dependencies: #1
Files: \`src/file2.ts\`
`;
    const planFile = join(plansDir, 'plan.md');
    writeFileSync(planFile, planContent, 'utf-8');
    await indexDocument(db!, planFile);

    // Mark dependency as PASS
    const coordination = await readCoordination(coordinationPath);
    coordination.tasks['0008-test-plan#1'] = {
      status: 'PASS',
      dependencies: [],
    };
    await writeCoordination(coordinationPath, coordination, coordination.version);
    context.coordination = await readCoordination(coordinationPath);

    const result = await handleGetNextTask({ agentType: 'coder' }, context);

    expect(result.isError).toBeFalsy();
    const resultText = result.content[0]?.text || '';
    expect(resultText).toContain('0008-test-plan#2');
  });

  it('should exclude task with missing dependency', async () => {
    const planContent = `# Test Plan

### #1: Feature One

Status: \`GAP\`
Dependencies: None
Files: \`src/file1.ts\`

### #2: Feature Two

Status: \`GAP\`
Dependencies: #1
Files: \`src/file2.ts\`
`;
    const planFile = join(plansDir, 'plan.md');
    writeFileSync(planFile, planContent, 'utf-8');
    await indexDocument(db!, planFile);

    // Don't mark dependency as PASS - it should be excluded
    const result = await handleGetNextTask({ agentType: 'coder' }, context);

    expect(result.isError).toBeFalsy();
    const resultText = result.content[0]?.text || '';
    expect(resultText).not.toContain('0008-test-plan#2');
    expect(resultText).toContain('0008-test-plan#1');
  });

  it('should exclude task with BLOCKED dependency', async () => {
    const planContent = `# Test Plan

### #1: Feature One

Status: \`GAP\`
Dependencies: None
Files: \`src/file1.ts\`

### #2: Feature Two

Status: \`GAP\`
Dependencies: #1
Files: \`src/file2.ts\`
`;
    const planFile = join(plansDir, 'plan.md');
    writeFileSync(planFile, planContent, 'utf-8');
    await indexDocument(db!, planFile);

    // Mark dependency as BLOCKED
    const coordination = await readCoordination(coordinationPath);
    coordination.tasks['0008-test-plan#1'] = {
      status: 'BLOCKED',
      dependencies: [],
    };
    await writeCoordination(coordinationPath, coordination, coordination.version);
    context.coordination = await readCoordination(coordinationPath);

    const result = await handleGetNextTask({ agentType: 'coder' }, context);

    expect(result.isError).toBeFalsy();
    const resultText = result.content[0]?.text || '';
    expect(resultText).not.toContain('0008-test-plan#2');
  });
});

describe('score-agent-match', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans', '0008-test-plan');
    coordinationPath = join(testDir, 'coordination.json');

    mkdirSync(plansDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = join(testDir, 'plans');

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

  it('should give bonus for matching agent persona', async () => {
    // Create agent file with coder persona
    const agentsDir = join(plansDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    const agentContent = `# Agent: Coder Agent

## Scope

Features: #1
Own: \`src/file1.ts\`
`;
    const agentFile = join(agentsDir, '001_agent_coder.agent.md');
    writeFileSync(agentFile, agentContent, 'utf-8');

    const planContent = `# Test Plan

### #1: Feature One

Status: \`GAP\`
Dependencies: None
Files: \`src/file1.ts\`
`;
    const planFile = join(plansDir, 'plan.md');
    writeFileSync(planFile, planContent, 'utf-8');
    await indexDocument(db!, planFile);
    await indexDocument(db!, agentFile);

    // Request as coder - should match
    const result = await handleGetNextTask({ agentType: 'coder' }, context);

    expect(result.isError).toBeFalsy();
    const resultText = result.content[0]?.text || '';
    expect(resultText).toContain('0008-test-plan#1');
  });

  it('should not give bonus for non-matching persona', async () => {
    const planContent = `# Test Plan

### #1: Feature One

Status: \`GAP\`
Dependencies: None
Files: \`src/file1.ts\`
`;
    const planFile = join(plansDir, 'plan.md');
    writeFileSync(planFile, planContent, 'utf-8');
    await indexDocument(db!, planFile);

    // Request as reviewer - no match, but should still return task
    const result = await handleGetNextTask({ agentType: 'reviewer' }, context);

    expect(result.isError).toBeFalsy();
    const resultText = result.content[0]?.text || '';
    expect(resultText).toContain('0008-test-plan#1');
  });
});

describe('penalize-conflicts', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans', '0008-test-plan');
    coordinationPath = join(testDir, 'coordination.json');

    mkdirSync(plansDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = join(testDir, 'plans');

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

  it('should exclude task with locked files', async () => {
    const planContent = `# Test Plan

### #1: Feature One

Status: \`GAP\`
Dependencies: None
Files: \`src/file1.ts\`

### #2: Feature Two

Status: \`GAP\`
Dependencies: None
Files: \`src/file2.ts\`
`;
    const planFile = join(plansDir, 'plan.md');
    writeFileSync(planFile, planContent, 'utf-8');
    await indexDocument(db!, planFile);

    // Lock file1.ts
    const coordination = await readCoordination(coordinationPath);
    coordination.fileLocks['src/file1.ts'] = 'other-agent';
    await writeCoordination(coordinationPath, coordination, coordination.version);
    context.coordination = await readCoordination(coordinationPath);

    const result = await handleGetNextTask({ agentType: 'coder' }, context);

    expect(result.isError).toBeFalsy();
    const resultText = result.content[0]?.text || '';
    expect(resultText).not.toContain('0008-test-plan#1');
    expect(resultText).toContain('0008-test-plan#2');
  });

  it('should check all task files for conflicts', async () => {
    const planContent = `# Test Plan

### #1: Feature One

Status: \`GAP\`
Dependencies: None
Files: \`src/file1.ts\`, \`src/file2.ts\`
`;
    const planFile = join(plansDir, 'plan.md');
    writeFileSync(planFile, planContent, 'utf-8');
    await indexDocument(db!, planFile);

    // Lock one of the files
    const coordination = await readCoordination(coordinationPath);
    coordination.fileLocks['src/file2.ts'] = 'other-agent';
    await writeCoordination(coordinationPath, coordination, coordination.version);
    context.coordination = await readCoordination(coordinationPath);

    const result = await handleGetNextTask({ agentType: 'coder' }, context);

    expect(result.isError).toBeFalsy();
    const resultText = result.content[0]?.text || '';
    expect(resultText).not.toContain('0008-test-plan#1');
  });
});

describe('exclude-task-ids', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans', '0008-test-plan');
    coordinationPath = join(testDir, 'coordination.json');

    mkdirSync(plansDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = join(testDir, 'plans');

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

  it('should exclude specified task IDs', async () => {
    const planContent = `# Test Plan

### #1: Feature One

Status: \`GAP\`
Dependencies: None
Files: \`src/file1.ts\`

### #2: Feature Two

Status: \`GAP\`
Dependencies: None
Files: \`src/file2.ts\`
`;
    const planFile = join(plansDir, 'plan.md');
    writeFileSync(planFile, planContent, 'utf-8');
    await indexDocument(db!, planFile);

    // Exclude task #1
    const result = await handleGetNextTask(
      { agentType: 'coder', excludeIds: ['0008-test-plan#1'] },
      context
    );

    expect(result.isError).toBeFalsy();
    const resultText = result.content[0]?.text || '';
    expect(resultText).not.toContain('0008-test-plan#1');
    expect(resultText).toContain('0008-test-plan#2');
  });

  it('should handle empty excludeIds', async () => {
    const planContent = `# Test Plan

### #1: Feature One

Status: \`GAP\`
Dependencies: None
Files: \`src/file1.ts\`
`;
    const planFile = join(plansDir, 'plan.md');
    writeFileSync(planFile, planContent, 'utf-8');
    await indexDocument(db!, planFile);

    const result = await handleGetNextTask({ agentType: 'coder', excludeIds: [] }, context);

    expect(result.isError).toBeFalsy();
    const resultText = result.content[0]?.text || '';
    expect(resultText).toContain('0008-test-plan#1');
  });
});
