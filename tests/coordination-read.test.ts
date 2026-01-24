import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { readCoordination, type CoordinationState } from '../src/coordination.js';

describe('coordination-read', () => {
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

  it('should read coordination state from file', async () => {
    const initialState: CoordinationState = {
      version: 1,
      agents: {},
      tasks: {},
      fileLocks: {},
    };
    writeFileSync(coordinationPath, JSON.stringify(initialState), 'utf-8');

    const state = await readCoordination(coordinationPath);
    expect(state.version).toBe(1);
    expect(state.agents).toEqual({});
    expect(state.tasks).toEqual({});
    expect(state.fileLocks).toEqual({});
  });

  it('should handle missing file by creating default state', async () => {
    const state = await readCoordination(coordinationPath);
    expect(state.version).toBe(1);
    expect(state.agents).toEqual({});
    expect(state.tasks).toEqual({});
    expect(state.fileLocks).toEqual({});
    expect(existsSync(coordinationPath)).toBe(true);
  });

  it('should parse valid JSON structure', async () => {
    const initialState: CoordinationState = {
      version: 2,
      agents: {
        'agent-1': {
          status: 'idle',
          persona: 'coder',
          filesLocked: [],
          heartbeat: new Date().toISOString(),
        },
      },
      tasks: {
        'task-1': {
          status: 'GAP',
          dependencies: [],
        },
      },
      fileLocks: {},
    };
    writeFileSync(coordinationPath, JSON.stringify(initialState), 'utf-8');

    const state = await readCoordination(coordinationPath);
    expect(state.version).toBe(2);
    expect(state.agents['agent-1']).toBeDefined();
    expect(state.tasks['task-1']).toBeDefined();
  });

  it('should handle malformed JSON gracefully', async () => {
    // Ensure directory exists
    mkdirSync(dirname(coordinationPath), { recursive: true });
    writeFileSync(coordinationPath, '{ invalid json }', 'utf-8');

    // Should return default state when JSON is malformed
    const state = await readCoordination(coordinationPath);
    expect(state.version).toBe(1);
    expect(state.agents).toEqual({});
    expect(state.tasks).toEqual({});
    expect(state.fileLocks).toEqual({});
  });
});
