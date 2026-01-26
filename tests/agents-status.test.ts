import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import { loadConfig } from '../src/config.js';
import { handleAgentsStatus } from '../src/resources/agents-status.js';
import type { ResourceContext } from '../src/types.js';

describe('return-agents-status', () => {
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

  it('should return agents status with structure', async () => {
    // Create coordination state with agents
      version: 1,
      agents: {
        'agent-1': {
          status: 'idle',
          persona: 'coder',
          filesLocked: [],
          heartbeat: new Date().toISOString(),
        },
        'agent-2': {
          status: 'WIP',
          persona: 'reviewer',
          taskId: 'task-1',
          filesLocked: ['file1.ts'],
          heartbeat: new Date().toISOString(),
        },
      },
      tasks: {},
      fileLocks: {},
      handoffs: {},
    };


    const result = await handleAgentsStatus('agents://status', context);

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe('agents://status');
    expect(result.contents[0].mimeType).toBe('application/json');

    const status = JSON.parse(result.contents[0].text || '{}');
    expect(status).toHaveProperty('agents');
    expect(status).toHaveProperty('totalAgents');
    expect(status).toHaveProperty('activeAgents');
    expect(status).toHaveProperty('staleAgents');
    expect(Array.isArray(status.agents)).toBe(true);
    expect(status.totalAgents).toBeGreaterThanOrEqual(2);
  });
});

describe('include-heartbeat-timestamps', () => {
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

  it('should include heartbeat timestamps and staleness', async () => {
    const now = new Date();
    const staleTime = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago

      version: 1,
      agents: {
        'agent-1': {
          status: 'idle',
          persona: 'coder',
          filesLocked: [],
          heartbeat: now.toISOString(),
        },
        'agent-2': {
          status: 'WIP',
          persona: 'reviewer',
          taskId: 'task-1',
          filesLocked: [],
          heartbeat: staleTime.toISOString(),
        },
      },
      tasks: {},
      fileLocks: {},
      handoffs: {},
    };


    const result = await handleAgentsStatus('agents://status', context);
    const status = JSON.parse(result.contents[0].text || '{}');

    expect(status.agents.length).toBeGreaterThanOrEqual(2);

    const agent1 = status.agents.find((a: AgentStatus) => a.id === 'agent-1');
    expect(agent1).toBeDefined();
    expect(agent1.lastHeartbeat).toBeDefined();
    expect(agent1.isStale).toBe(false);

    const agent2 = status.agents.find((a: AgentStatus) => a.id === 'agent-2');
    expect(agent2).toBeDefined();
    expect(agent2.lastHeartbeat).toBeDefined();
    expect(agent2.isStale).toBe(true);
    expect(status.staleAgents).toBeGreaterThanOrEqual(1);
  });
});

describe('show-task-assignments', () => {
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

  it('should show task assignments in agent status', async () => {
      version: 1,
      agents: {
        'agent-1': {
          status: 'WIP',
          persona: 'coder',
          taskId: 'task-1',
          filesLocked: ['file1.ts', 'file2.ts'],
          heartbeat: new Date().toISOString(),
        },
        'agent-2': {
          status: 'idle',
          persona: 'reviewer',
          filesLocked: [],
          heartbeat: new Date().toISOString(),
        },
      },
      tasks: {},
      fileLocks: {},
      handoffs: {},
    };


    const result = await handleAgentsStatus('agents://status', context);
    const status = JSON.parse(result.contents[0].text || '{}');

    const agent1 = status.agents.find((a: AgentStatus) => a.id === 'agent-1');
    expect(agent1).toBeDefined();
    expect(agent1.taskId).toBe('task-1');
    expect(agent1.filesLocked).toEqual(['file1.ts', 'file2.ts']);
    expect(agent1.status).toBe('WIP');
    expect(status.activeAgents).toBeGreaterThanOrEqual(1);
  });
});
