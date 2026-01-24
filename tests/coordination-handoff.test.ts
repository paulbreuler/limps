import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  readCoordination,
  writeCoordination,
  createHandoff,
  acceptHandoff,
  rejectHandoff,
  type CoordinationState,
  type TaskHandoff,
} from '../src/coordination.js';

describe('coordination-handoff', () => {
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
    const tempPath = `${coordinationPath}.tmp`;
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
  });

  it('should create handoff', () => {
    const handoff = createHandoff(
      'agent-coder',
      'reviewer',
      {
        id: 'task-1',
        filesModified: ['file1.ts', 'file2.ts'],
        summary: 'Implemented feature X',
        testsAdded: 5,
      },
      [
        { type: 'code_quality', required: true },
        { type: 'security', required: false },
      ],
      3 // maxIterations
    );

    expect(handoff.fromAgent).toBe('agent-coder');
    expect(handoff.toPersona).toBe('reviewer');
    expect(handoff.task.id).toBe('task-1');
    expect(handoff.task.filesModified).toEqual(['file1.ts', 'file2.ts']);
    expect(handoff.task.summary).toBe('Implemented feature X');
    expect(handoff.task.testsAdded).toBe(5);
    expect(handoff.reviewCriteria).toHaveLength(2);
    expect(handoff.iterationCount).toBe(0);
    expect(handoff.maxIterations).toBe(3);
  });

  it('should accept handoff and store in coordination', async () => {
    // Create initial coordination state
    const initialState: CoordinationState = {
      version: 1,
      agents: {},
      tasks: {
        'task-1': {
          status: 'WIP',
          claimedBy: 'agent-reviewer',
          dependencies: [],
        },
      },
      fileLocks: {},
      handoffs: {},
    };

    await writeCoordination(coordinationPath, initialState, 1);
    const coordination = await readCoordination(coordinationPath);

    // Create handoff
    const handoff = createHandoff(
      'agent-coder',
      'reviewer',
      {
        id: 'task-1',
        filesModified: ['file1.ts'],
        summary: 'Feature implementation',
        testsAdded: 3,
      },
      [{ type: 'code_quality', required: true }],
      3
    );

    // Accept handoff
    const updatedCoordination = acceptHandoff(coordination, handoff, 'agent-reviewer');

    // Write updated state
    await writeCoordination(coordinationPath, updatedCoordination, coordination.version);

    // Verify handoff is stored
    const finalState = await readCoordination(coordinationPath);
    expect(finalState.handoffs?.['task-1']).toBeDefined();
    expect(finalState.handoffs?.['task-1']?.fromAgent).toBe('agent-coder');
    expect(finalState.handoffs?.['task-1']?.toPersona).toBe('reviewer');
    expect(finalState.handoffs?.['task-1']?.task.id).toBe('task-1');
  });

  it('should reject handoff with feedback and increment iteration', () => {
    const handoff: TaskHandoff = {
      fromAgent: 'agent-coder',
      toPersona: 'reviewer',
      task: {
        id: 'task-1',
        filesModified: ['file1.ts'],
        summary: 'Feature implementation',
        testsAdded: 3,
      },
      reviewCriteria: [{ type: 'code_quality', required: true }],
      iterationCount: 0,
      maxIterations: 3,
    };

    const result = rejectHandoff(handoff, 'Needs more tests');

    expect(result.updatedHandoff.iterationCount).toBe(1);
    expect(result.shouldEscalate).toBe(false);
    expect(result.newStatus).toBe('WIP');
  });

  it('should escalate after max iterations', () => {
    const handoff: TaskHandoff = {
      fromAgent: 'agent-coder',
      toPersona: 'reviewer',
      task: {
        id: 'task-1',
        filesModified: ['file1.ts'],
        summary: 'Feature implementation',
        testsAdded: 3,
      },
      reviewCriteria: [{ type: 'code_quality', required: true }],
      iterationCount: 2, // One less than max
      maxIterations: 3,
    };

    const result = rejectHandoff(handoff, 'Still needs work');

    expect(result.updatedHandoff.iterationCount).toBe(3);
    expect(result.shouldEscalate).toBe(true);
    expect(result.newStatus).toBe('BLOCKED');
  });

  it('should persist handoff iteration count across sessions', async () => {
    // Create handoff with iteration count
    const handoff: TaskHandoff = {
      fromAgent: 'agent-coder',
      toPersona: 'reviewer',
      task: {
        id: 'task-1',
        filesModified: ['file1.ts'],
        summary: 'Feature implementation',
        testsAdded: 3,
      },
      reviewCriteria: [{ type: 'code_quality', required: true }],
      iterationCount: 1,
      maxIterations: 3,
    };

    // Store in coordination
    const initialState: CoordinationState = {
      version: 1,
      agents: {},
      tasks: {
        'task-1': {
          status: 'WIP',
          claimedBy: 'agent-reviewer',
          dependencies: [],
        },
      },
      fileLocks: {},
      handoffs: {
        'task-1': handoff,
      },
    };

    await writeCoordination(coordinationPath, initialState, 1);

    // Read back and verify iteration count persisted
    const readState = await readCoordination(coordinationPath);
    expect(readState.handoffs?.['task-1']?.iterationCount).toBe(1);

    // Reject again
    const updatedHandoff = readState.handoffs!['task-1'];
    const result = rejectHandoff(updatedHandoff, 'More feedback');

    expect(result.updatedHandoff.iterationCount).toBe(2);
  });
});
