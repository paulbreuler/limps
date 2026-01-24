import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  readCoordination,
  writeCoordination,
  type CoordinationState,
} from '../src/coordination.js';

describe('coordination-write', () => {
  let coordinationPath: string;

  beforeEach(() => {
    coordinationPath = join(
      tmpdir(),
      `coordination-${Date.now()}-${Math.random().toString(36).substring(7)}.json`
    );
  });

  afterEach(() => {
    if (existsSync(coordinationPath)) {
      unlinkSync(coordinationPath);
    }
    // Clean up temp files
    const tempPath = `${coordinationPath}.tmp`;
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
  });

  it('should write coordination state to file', async () => {
    // First read creates the file with version 1
    await readCoordination(coordinationPath);

    const state: CoordinationState = {
      version: 2,
      agents: {},
      tasks: {},
      fileLocks: {},
    };

    await writeCoordination(coordinationPath, state, 1);
    expect(existsSync(coordinationPath)).toBe(true);

    const content = readFileSync(coordinationPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe(2);
  });

  it('should update agent status atomically', async () => {
    // First read creates the file with version 1
    await readCoordination(coordinationPath);

    const initialState: CoordinationState = {
      version: 2,
      agents: {},
      tasks: {},
      fileLocks: {},
    };

    await writeCoordination(coordinationPath, initialState, 1);

    const updatedState: CoordinationState = {
      version: 3,
      agents: {
        'agent-1': {
          status: 'WIP',
          persona: 'coder',
          taskId: 'task-1',
          filesLocked: ['file1.ts'],
          heartbeat: new Date().toISOString(),
        },
      },
      tasks: {},
      fileLocks: { 'file1.ts': 'agent-1' },
    };

    await writeCoordination(coordinationPath, updatedState, 2);

    const readState = await readCoordination(coordinationPath);
    expect(readState.version).toBe(3);
    expect(readState.agents['agent-1']?.status).toBe('WIP');
    expect(readState.fileLocks['file1.ts']).toBe('agent-1');
  });

  it('should write atomically using temp file and rename', async () => {
    // First read creates the file with version 1
    await readCoordination(coordinationPath);

    const state: CoordinationState = {
      version: 2,
      agents: {},
      tasks: {},
      fileLocks: {},
    };

    await writeCoordination(coordinationPath, state, 1);

    // Verify file exists and is valid JSON
    const content = readFileSync(coordinationPath, 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();
  });
});
