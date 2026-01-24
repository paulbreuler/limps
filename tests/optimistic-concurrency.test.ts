import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  readCoordination,
  writeCoordination,
  type CoordinationState,
} from '../src/coordination.js';

describe('optimistic-concurrency', () => {
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
  });

  it('should detect concurrent write conflicts', async () => {
    // Create initial file with version 1
    await readCoordination(coordinationPath);

    // Simulate concurrent read and write
    const state1 = await readCoordination(coordinationPath);
    const state2 = await readCoordination(coordinationPath);

    // First write succeeds
    await writeCoordination(coordinationPath, { ...state1, version: 2 }, 1);

    // Second write should fail due to version mismatch
    await expect(
      writeCoordination(coordinationPath, { ...state2, version: 2 }, 1)
    ).rejects.toThrow();
  });

  it('should allow writes with correct expected version', async () => {
    // Create initial file with version 1
    await readCoordination(coordinationPath);

    const state = await readCoordination(coordinationPath);
    const updatedState: CoordinationState = {
      ...state,
      version: 2,
      agents: {
        'agent-1': {
          status: 'idle',
          persona: 'coder',
          filesLocked: [],
          heartbeat: new Date().toISOString(),
        },
      },
    };

    await expect(writeCoordination(coordinationPath, updatedState, 1)).resolves.not.toThrow();

    const finalState = await readCoordination(coordinationPath);
    expect(finalState.version).toBe(2);
    expect(finalState.agents['agent-1']).toBeDefined();
  });
});
