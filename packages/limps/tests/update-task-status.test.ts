import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import { createTestConfig } from './test-config-helper.js';
import { handleUpdateTaskStatus } from '../src/tools/update-task-status.js';
import type { ToolContext } from '../src/types.js';

describe('update-status-gap-to-wip', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let planDir: string;
  let agentsDir: string;
  let agentFile: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    planDir = join(plansDir, '0001-test-plan');
    agentsDir = join(planDir, 'agents');
    agentFile = join(agentsDir, '001_test-agent.agent.md');

    mkdirSync(agentsDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    // Create agent file with GAP status
    const agentContent = `---
status: GAP
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 1: Test Feature

This is a test agent.
`;
    writeFileSync(agentFile, agentContent, 'utf-8');

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

  it('should update status from GAP to WIP', async () => {
    const result = await handleUpdateTaskStatus(
      { taskId: '0001-test-plan#001', status: 'WIP' },
      context
    );

    expect(result.isError).toBeFalsy();

    // Verify agent frontmatter was updated
    const updatedContent = readFileSync(agentFile, 'utf-8');
    expect(updatedContent).toContain('status: WIP');
    expect(updatedContent).not.toContain('status: GAP');
  });
});

describe('status-updates', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let planDir: string;
  let agentsDir: string;
  let agentFile: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    planDir = join(plansDir, '0001-test-plan');
    agentsDir = join(planDir, 'agents');
    agentFile = join(agentsDir, '001_test-agent.agent.md');

    mkdirSync(agentsDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    // Create agent file with WIP status
    const agentContent = `---
status: WIP
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 1: Test Feature

This is a test agent.
`;
    writeFileSync(agentFile, agentContent, 'utf-8');

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

  it('should allow WIP to GAP transition (status updates are not validated)', async () => {
    const result = await handleUpdateTaskStatus(
      { taskId: '0001-test-plan#001', status: 'GAP' },
      context
    );

    expect(result.isError).toBeFalsy();

    // Verify agent frontmatter was updated
    const updatedContent = readFileSync(agentFile, 'utf-8');
    expect(updatedContent).toContain('status: GAP');
  });

  it('should allow WIP to PASS transition', async () => {
    const result = await handleUpdateTaskStatus(
      { taskId: '0001-test-plan#001', status: 'PASS' },
      context
    );

    expect(result.isError).toBeFalsy();

    // Verify agent frontmatter was updated
    const updatedContent = readFileSync(agentFile, 'utf-8');
    expect(updatedContent).toContain('status: PASS');
  });

  it('should allow WIP to BLOCKED transition', async () => {
    const result = await handleUpdateTaskStatus(
      { taskId: '0001-test-plan#001', status: 'BLOCKED' },
      context
    );

    expect(result.isError).toBeFalsy();

    // Verify agent frontmatter was updated
    const updatedContent = readFileSync(agentFile, 'utf-8');
    expect(updatedContent).toContain('status: BLOCKED');
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

  it('should handle nonexistent agent file', async () => {
    const result = await handleUpdateTaskStatus(
      { taskId: 'nonexistent-plan#999', status: 'WIP' },
      context
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Agent file not found');
  });
});

describe('agent-with-notes-and-agentid', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let planDir: string;
  let agentsDir: string;
  let agentFile: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    planDir = join(plansDir, '0042-test-plan');
    agentsDir = join(planDir, 'agents');
    agentFile = join(agentsDir, '000_foundation.agent.md');

    mkdirSync(agentsDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    // Create agent file with GAP status
    const agentContent = `---
status: GAP
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 0: Component IR + Module Graph Foundation

Build Component IR + module graph with alias and re-export resolution.
`;
    writeFileSync(agentFile, agentContent, 'utf-8');

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

  it('should update status from GAP to WIP with agentId', async () => {
    const result = await handleUpdateTaskStatus(
      { taskId: '0042-test-plan#000', status: 'WIP', agentId: 'agent-123' },
      context
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('by agent agent-123');

    // Verify agent frontmatter was updated
    const updatedContent = readFileSync(agentFile, 'utf-8');
    expect(updatedContent).toContain('status: WIP');
    expect(updatedContent).not.toContain('status: GAP');
  });

  it('should update status with notes', async () => {
    const result = await handleUpdateTaskStatus(
      { taskId: '0042-test-plan#000', status: 'WIP', notes: 'Starting work on this task' },
      context
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Notes: Starting work on this task');

    // Verify agent frontmatter was updated
    const updatedContent = readFileSync(agentFile, 'utf-8');
    expect(updatedContent).toContain('status: WIP');
  });

  it('should update status with both agentId and notes', async () => {
    const result = await handleUpdateTaskStatus(
      {
        taskId: '0042-test-plan#000',
        status: 'WIP',
        agentId: 'agent-456',
        notes: 'Ready to begin',
      },
      context
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('by agent agent-456');
    expect(result.content[0].text).toContain('Notes: Ready to begin');
  });
});
