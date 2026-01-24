import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, unlinkSync } from 'fs';
import { dirname } from 'path';

/**
 * Task handoff contract for sequential review workflows.
 */
export interface TaskHandoff {
  fromAgent: string;
  toPersona: 'reviewer' | 'pm' | 'customer';
  task: {
    id: string;
    filesModified: string[];
    summary: string;
    testsAdded: number;
  };
  reviewCriteria: {
    type: 'code_quality' | 'security' | 'ux' | 'requirements';
    required: boolean;
  }[];
  iterationCount: number;
  maxIterations: number;
}

/**
 * Coordination state for multi-agent orchestration.
 */
export interface CoordinationState {
  version: number;
  agents: Record<string, AgentState>;
  tasks: Record<string, TaskState>;
  fileLocks: Record<string, string>; // file path -> agent id
  handoffs?: Record<string, TaskHandoff>; // taskId -> handoff
}

/**
 * Agent state tracking.
 */
export interface AgentState {
  status: 'idle' | 'WIP';
  persona: 'coder' | 'reviewer' | 'pm' | 'customer';
  taskId?: string;
  filesLocked: string[];
  heartbeat: string; // ISO timestamp
}

/**
 * Task state tracking.
 */
export interface TaskState {
  status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
  claimedBy?: string;
  dependencies: string[];
}

/**
 * Read coordination state from file.
 * Creates default state if file doesn't exist.
 *
 * @param path - Path to coordination.json file
 * @returns Coordination state
 */
export async function readCoordination(path: string): Promise<CoordinationState> {
  if (!existsSync(path)) {
    const defaultState: CoordinationState = {
      version: 1,
      agents: {},
      tasks: {},
      fileLocks: {},
      handoffs: {},
    };
    // Ensure directory exists
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(defaultState, null, 2), 'utf-8');
    return defaultState;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const state = JSON.parse(content) as CoordinationState;

    // Validate structure
    if (typeof state.version !== 'number' || !state.agents || !state.tasks || !state.fileLocks) {
      // Return default state if structure is invalid
      const defaultState: CoordinationState = {
        version: 1,
        agents: {},
        tasks: {},
        fileLocks: {},
        handoffs: {},
      };
      return defaultState;
    }

    // Ensure handoffs exists (for backward compatibility)
    if (!state.handoffs) {
      state.handoffs = {};
    }

    return state;
  } catch (_error) {
    // Handle malformed JSON gracefully
    const defaultState: CoordinationState = {
      version: 1,
      agents: {},
      tasks: {},
      fileLocks: {},
      handoffs: {},
    };
    return defaultState;
  }
}

/**
 * Write coordination state to file with optimistic concurrency control.
 * Uses atomic write (temp file + rename) to prevent corruption.
 *
 * @param path - Path to coordination.json file
 * @param state - Coordination state to write
 * @param expectedVersion - Expected version number (for optimistic concurrency)
 * @throws Error if expectedVersion doesn't match current version
 */
export async function writeCoordination(
  path: string,
  state: CoordinationState,
  expectedVersion: number
): Promise<void> {
  // Ensure directory exists
  mkdirSync(dirname(path), { recursive: true });

  // Read current state to check version
  const currentState = await readCoordination(path);

  if (currentState.version !== expectedVersion) {
    throw new Error(`Version mismatch: expected ${expectedVersion}, got ${currentState.version}`);
  }

  // Atomic write: write to temp file, then rename
  const tempPath = `${path}.tmp`;
  try {
    writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');

    // Rename is atomic on most filesystems
    renameSync(tempPath, path);
  } catch (error) {
    // Clean up temp file on error
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
    throw error;
  }
}

/**
 * Create a task handoff contract.
 *
 * @param fromAgent - Agent ID creating the handoff
 * @param toPersona - Target persona type
 * @param task - Task information
 * @param criteria - Review criteria
 * @param maxIterations - Maximum iterations before escalation (typically from config.maxHandoffIterations)
 * @returns Task handoff contract
 */
export function createHandoff(
  fromAgent: string,
  toPersona: string,
  task: TaskHandoff['task'],
  criteria: TaskHandoff['reviewCriteria'],
  maxIterations = 3
): TaskHandoff {
  // Validate toPersona matches expected type
  if (!['reviewer', 'pm', 'customer'].includes(toPersona)) {
    throw new Error(`Invalid toPersona: ${toPersona}. Must be 'reviewer', 'pm', or 'customer'`);
  }

  return {
    fromAgent,
    toPersona: toPersona as 'reviewer' | 'pm' | 'customer',
    task,
    reviewCriteria: criteria,
    iterationCount: 0,
    maxIterations,
  };
}

/**
 * Accept a handoff and store it in coordination state.
 * Updates coordination state to link handoff to task.
 * Note: Interface shows void return, but implementation returns updated state
 * for functional/immutable pattern. Caller should write coordination state.
 *
 * @param coordination - Coordination state to update
 * @param handoff - Handoff to accept
 * @param _agentId - Agent ID accepting the handoff
 * @returns Updated coordination state (caller should write to file)
 */
export function acceptHandoff(
  coordination: CoordinationState,
  handoff: TaskHandoff,
  _agentId: string
): CoordinationState {
  const handoffs = coordination.handoffs || {};

  return {
    ...coordination,
    handoffs: {
      ...handoffs,
      [handoff.task.id]: handoff,
    },
  };
}

/**
 * Reject a handoff with feedback and determine escalation.
 * Increments iteration count and checks if escalation is needed.
 *
 * @param handoff - Handoff to reject
 * @param _feedback - Rejection feedback (for future use - could be stored in handoff or separate store)
 * @returns Escalation decision and new status (includes updatedHandoff for convenience)
 */
export function rejectHandoff(
  handoff: TaskHandoff,
  _feedback: string
): { shouldEscalate: boolean; newStatus: 'WIP' | 'BLOCKED'; updatedHandoff: TaskHandoff } {
  const newIterationCount = handoff.iterationCount + 1;
  const shouldEscalate = newIterationCount >= handoff.maxIterations;

  const updatedHandoff: TaskHandoff = {
    ...handoff,
    iterationCount: newIterationCount,
  };

  // Store feedback in handoff (extend interface if needed, or use a separate feedback store)
  // For now, we'll return the decision and let the caller handle feedback storage

  return {
    shouldEscalate,
    newStatus: shouldEscalate ? 'BLOCKED' : 'WIP',
    updatedHandoff,
  };
}
