import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import {
  readCoordination,
  writeCoordination,
  type CoordinationState,
} from '../src/coordination.js';
import { handleReleaseTask } from '../src/tools/release-task.js';
import type { ToolContext } from '../src/types.js';
import type { ServerConfig } from '../src/config.js';

describe('release-task', () => {
  let coordinationPath: string;
  let dbPath: string;
  let db: Database.Database;
  let context: ToolContext;
  let config: ServerConfig;

  beforeEach(() => {
    coordinationPath = join(
      tmpdir(),
      `coordination-${Date.now()}-${Math.random().toString(36).substring(7)}.json`
    );
    dbPath = join(tmpdir(), `test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);
    db = new Database(dbPath);

    config = {
      plansPath: './plans',
      dataPath: './data',
      coordinationPath,
      heartbeatTimeout: 300000,
      debounceDelay: 200,
      maxHandoffIterations: 3,
    };

    context = {
      db,
      coordination: {
        version: 1,
        agents: {},
        tasks: {},
        fileLocks: {},
      },
      config,
    };
  });

  afterEach(() => {
    if (existsSync(coordinationPath)) {
      unlinkSync(coordinationPath);
    }
    if (existsSync(dbPath)) {
      db.close();
      unlinkSync(dbPath);
    }
  });

  it('should release claimed task', async () => {
    // Setup: task claimed by agent-1
    const initialState: CoordinationState = {
      version: 1,
      agents: {
        'agent-1': {
          status: 'WIP',
          persona: 'coder',
          taskId: 'task-1',
          filesLocked: ['file1.ts', 'file2.ts'],
          heartbeat: new Date().toISOString(),
        },
      },
      tasks: {
        'task-1': {
          status: 'WIP',
          claimedBy: 'agent-1',
          dependencies: [],
        },
      },
      fileLocks: {
        'file1.ts': 'agent-1',
        'file2.ts': 'agent-1',
      },
    };

    await writeCoordination(coordinationPath, initialState, 1);
    const freshState = await readCoordination(coordinationPath);
    context.coordination = freshState;

    const result = await handleReleaseTask(
      {
        taskId: 'task-1',
        agentId: 'agent-1',
      },
      context
    );

    expect(result.isError).toBeUndefined();

    const finalState = await readCoordination(coordinationPath);
    expect(finalState.tasks['task-1']?.claimedBy).toBeUndefined();
    expect(finalState.tasks['task-1']?.status).toBe('GAP'); // Reverts to GAP if no finalStatus
    expect(finalState.agents['agent-1']?.status).toBe('idle');
    expect(finalState.agents['agent-1']?.taskId).toBeUndefined();
    expect(finalState.agents['agent-1']?.filesLocked).toEqual([]);
    expect(finalState.fileLocks['file1.ts']).toBeUndefined();
    expect(finalState.fileLocks['file2.ts']).toBeUndefined();
  });

  it('should reject wrong agent release', async () => {
    // Setup: task claimed by agent-1
    const initialState: CoordinationState = {
      version: 1,
      agents: {
        'agent-1': {
          status: 'WIP',
          persona: 'coder',
          taskId: 'task-1',
          filesLocked: [],
          heartbeat: new Date().toISOString(),
        },
      },
      tasks: {
        'task-1': {
          status: 'WIP',
          claimedBy: 'agent-1',
          dependencies: [],
        },
      },
      fileLocks: {},
    };

    await writeCoordination(coordinationPath, initialState, 1);
    const freshState = await readCoordination(coordinationPath);
    context.coordination = freshState;

    const result = await handleReleaseTask(
      {
        taskId: 'task-1',
        agentId: 'agent-2', // Wrong agent
      },
      context
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('not claimed by agent');

    // Verify state unchanged
    const finalState = await readCoordination(coordinationPath);
    expect(finalState.tasks['task-1']?.claimedBy).toBe('agent-1');
  });

  it('should release file locks', async () => {
    // Setup: task with file locks
    const initialState: CoordinationState = {
      version: 1,
      agents: {
        'agent-1': {
          status: 'WIP',
          persona: 'coder',
          taskId: 'task-1',
          filesLocked: ['file1.ts', 'file2.ts'],
          heartbeat: new Date().toISOString(),
        },
      },
      tasks: {
        'task-1': {
          status: 'WIP',
          claimedBy: 'agent-1',
          dependencies: [],
        },
      },
      fileLocks: {
        'file1.ts': 'agent-1',
        'file2.ts': 'agent-1',
      },
    };

    await writeCoordination(coordinationPath, initialState, 1);
    const freshState = await readCoordination(coordinationPath);
    context.coordination = freshState;

    const result = await handleReleaseTask(
      {
        taskId: 'task-1',
        agentId: 'agent-1',
      },
      context
    );

    expect(result.isError).toBeUndefined();

    const finalState = await readCoordination(coordinationPath);
    expect(finalState.fileLocks['file1.ts']).toBeUndefined();
    expect(finalState.fileLocks['file2.ts']).toBeUndefined();
    expect(Object.keys(finalState.fileLocks).length).toBe(0);
  });

  it('should update task status on release', async () => {
    // Setup: task claimed by agent-1
    const initialState: CoordinationState = {
      version: 1,
      agents: {
        'agent-1': {
          status: 'WIP',
          persona: 'coder',
          taskId: 'task-1',
          filesLocked: [],
          heartbeat: new Date().toISOString(),
        },
      },
      tasks: {
        'task-1': {
          status: 'WIP',
          claimedBy: 'agent-1',
          dependencies: [],
        },
      },
      fileLocks: {},
    };

    await writeCoordination(coordinationPath, initialState, 1);
    const freshState = await readCoordination(coordinationPath);
    context.coordination = freshState;

    const result = await handleReleaseTask(
      {
        taskId: 'task-1',
        agentId: 'agent-1',
        finalStatus: 'PASS',
      },
      context
    );

    expect(result.isError).toBeUndefined();

    const finalState = await readCoordination(coordinationPath);
    expect(finalState.tasks['task-1']?.status).toBe('PASS');
    expect(finalState.tasks['task-1']?.claimedBy).toBeUndefined();
  });

  it('should update task status to BLOCKED when releasing', async () => {
    const initialState: CoordinationState = {
      version: 1,
      agents: {
        'agent-1': {
          status: 'WIP',
          persona: 'coder',
          taskId: 'task-1',
          filesLocked: [],
          heartbeat: new Date().toISOString(),
        },
      },
      tasks: {
        'task-1': {
          status: 'WIP',
          claimedBy: 'agent-1',
          dependencies: [],
        },
      },
      fileLocks: {},
    };

    await writeCoordination(coordinationPath, initialState, 1);
    const freshState = await readCoordination(coordinationPath);
    context.coordination = freshState;

    const result = await handleReleaseTask(
      {
        taskId: 'task-1',
        agentId: 'agent-1',
        finalStatus: 'BLOCKED',
      },
      context
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('released successfully');
    expect(result.content[0].text).toContain('status BLOCKED');

    const finalState = await readCoordination(coordinationPath);
    expect(finalState.tasks['task-1']?.status).toBe('BLOCKED');
  });

  it('should release without status update when status not provided', async () => {
    const initialState: CoordinationState = {
      version: 1,
      agents: {
        'agent-1': {
          status: 'WIP',
          persona: 'coder',
          taskId: 'task-1',
          filesLocked: [],
          heartbeat: new Date().toISOString(),
        },
      },
      tasks: {
        'task-1': {
          status: 'WIP',
          claimedBy: 'agent-1',
          dependencies: [],
        },
      },
      fileLocks: {},
    };

    await writeCoordination(coordinationPath, initialState, 1);
    const freshState = await readCoordination(coordinationPath);
    context.coordination = freshState;

    const result = await handleReleaseTask(
      {
        taskId: 'task-1',
        agentId: 'agent-1',
        // No finalStatus provided
      },
      context
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('released successfully');
    expect(result.content[0].text).not.toContain('status');

    const finalState = await readCoordination(coordinationPath);
    // When no finalStatus provided, status resets to GAP (default behavior)
    expect(finalState.tasks['task-1']?.status).toBe('GAP');
    expect(finalState.tasks['task-1']?.claimedBy).toBeUndefined();
  });
});
