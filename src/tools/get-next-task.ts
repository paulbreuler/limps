import { z } from 'zod';
import { readCoordination, type CoordinationState } from '../coordination.js';
import { extractPlanId, parseTasksFromDocument, type ParsedTask } from '../task-parser.js';
import type { ToolContext, ToolResult } from '../types.js';

/**
 * Input schema for get_next_task tool.
 */
export const GetNextTaskInputSchema = z.object({
  agentType: z.enum(['coder', 'reviewer', 'pm', 'customer']),
  excludeIds: z.array(z.string()).optional(),
});

/**
 * Task score interface.
 */
export interface TaskScore {
  taskId: string;
  score: number;
  reasons: string[];
}

/**
 * Task interface for internal use (extends ParsedTask for backward compatibility).
 */
type Task = ParsedTask;

/**
 * Resolve dependency to task ID.
 * Handles both feature numbers (#1) and full task IDs (0008#1).
 */
function resolveDependency(dep: string, planId: string): string | null {
  // If it's already a full task ID (format: planId#featureNumber), return it
  // A full task ID has at least one character before the #
  const fullTaskIdMatch = dep.match(/^([^#]+)#(\d+)$/);
  if (fullTaskIdMatch) {
    return dep;
  }

  // If it's a feature number like #1, resolve to task ID
  const featureMatch = dep.match(/#(\d+)/);
  if (featureMatch) {
    const featureNum = featureMatch[1];
    const taskId = `${planId}#${featureNum}`;
    return taskId;
  }

  return null;
}

/**
 * Check if all dependencies are satisfied (status is PASS).
 */
function areDependenciesSatisfied(task: Task, coordination: CoordinationState): boolean {
  if (task.dependencies.length === 0) {
    return true;
  }

  for (const dep of task.dependencies) {
    const taskId = resolveDependency(dep, task.planId);
    if (!taskId) {
      // Dependency not found - consider unsatisfied
      return false;
    }

    const depTask = coordination.tasks[taskId];
    if (!depTask || depTask.status !== 'PASS') {
      return false;
    }
  }

  return true;
}

/**
 * Check if any files are locked by other agents.
 */
function hasFileConflicts(task: Task, coordination: CoordinationState): boolean {
  for (const file of task.files) {
    const lockedBy = coordination.fileLocks[file];
    if (lockedBy) {
      return true;
    }
  }
  return false;
}

/**
 * Score a task based on dependencies, agent match, and file conflicts.
 *
 * @param task - Task to score
 * @param agentType - Requested agent persona type
 * @param coordination - Coordination state
 * @returns Task score with reasons
 */
export function scoreTask(
  task: Task,
  agentType: 'coder' | 'reviewer' | 'pm' | 'customer',
  coordination: CoordinationState
): TaskScore {
  const reasons: string[] = [];
  let score = 100; // Base score

  // Only GAP tasks are eligible
  if (task.status !== 'GAP') {
    return {
      taskId: task.id,
      score: -1000,
      reasons: [`Task status is ${task.status}, not GAP`],
    };
  }

  // Check dependencies
  if (!areDependenciesSatisfied(task, coordination)) {
    return {
      taskId: task.id,
      score: -1000,
      reasons: ['Not all dependencies are satisfied (PASS)'],
    };
  }

  // Bonus for satisfied dependencies
  if (task.dependencies.length > 0) {
    score += 50;
    reasons.push('All dependencies satisfied');
  }

  // Check agent persona match
  if (task.agentPersona === agentType) {
    score += 100;
    reasons.push(`Agent persona matches (${agentType})`);
  }

  // Check file conflicts
  if (hasFileConflicts(task, coordination)) {
    return {
      taskId: task.id,
      score: -1000,
      reasons: ['One or more files are locked by another agent'],
    };
  }

  return {
    taskId: task.id,
    score,
    reasons: reasons.length > 0 ? reasons : ['Base score'],
  };
}

/**
 * Handle get_next_task tool request.
 * Returns the highest-priority available task based on scoring algorithm.
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result
 */
export async function handleGetNextTask(
  input: z.infer<typeof GetNextTaskInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const { agentType, excludeIds = [] } = input;

  // Read fresh coordination state (will be used in scoring)
  const coordination = await readCoordination(context.config.coordinationPath);

  // Query database for all planning documents
  const plansPath = context.config.plansPath;
  const documents = context.db
    .prepare(
      `
    SELECT path, content
    FROM documents
    WHERE path LIKE ?
  `
    )
    .all(`${plansPath}%`) as { path: string; content: string }[];

  // Parse all tasks from documents
  const allTasks: Task[] = [];
  for (const doc of documents) {
    const planId = extractPlanId(doc.path);
    if (!planId) {
      continue;
    }

    const tasks = parseTasksFromDocument(doc.path, doc.content, planId);
    allTasks.push(...tasks);
  }

  // Filter and score tasks
  const scoredTasks: TaskScore[] = [];

  for (const task of allTasks) {
    // Skip excluded tasks
    if (excludeIds.includes(task.id)) {
      continue;
    }

    // Score the task
    const score = scoreTask(task, agentType, coordination);

    // Only include eligible tasks (score >= 0)
    if (score.score >= 0) {
      scoredTasks.push(score);
    }
  }

  // Sort by score (descending), then by planId (ascending), then by featureNumber (ascending)
  scoredTasks.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score; // Higher score first
    }

    // Tie-breaker: sort by task ID (planId#featureNumber)
    const aParts = a.taskId.split('#');
    const bParts = b.taskId.split('#');
    const aPlanId = aParts[0];
    const bPlanId = bParts[0];

    if (aPlanId !== bPlanId) {
      return aPlanId.localeCompare(bPlanId); // Lower planId first
    }

    const aFeature = parseInt(aParts[1] || '0', 10);
    const bFeature = parseInt(bParts[1] || '0', 10);
    return aFeature - bFeature; // Lower feature number first
  });

  // Return highest-scoring task
  if (scoredTasks.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              taskId: null,
              message: 'No available tasks found',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const topTask = scoredTasks[0];

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            taskId: topTask.taskId,
            score: topTask.score,
            reasons: topTask.reasons,
          },
          null,
          2
        ),
      },
    ],
  };
}
