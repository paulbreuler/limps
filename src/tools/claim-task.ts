import { z } from 'zod';
import {
  readCoordination,
  writeCoordination,
  type CoordinationState,
  type TaskState,
} from '../coordination.js';
import { extractPlanId, parseTasksFromDocument, findTaskById } from '../task-parser.js';
import type { ToolContext, ToolResult } from '../types.js';

/**
 * Input schema for claim_task tool.
 */
export const ClaimTaskInputSchema = z.object({
  taskId: z.string(),
  agentId: z.string(),
  persona: z.enum(['coder', 'reviewer', 'pm', 'customer']).optional(),
});

/**
 * Extract files from task metadata.
 * For now, returns empty array. In future, this could query the database
 * to get files associated with the task from planning documents.
 *
 * @param _taskId - Task identifier
 * @param _context - Tool context
 * @returns Array of file paths
 */
async function extractTaskFiles(_taskId: string, _context: ToolContext): Promise<string[]> {
  // TODO: Extract files from task metadata in database
  // For now, return empty array - files will be determined by task implementation
  return [];
}

/**
 * Parse task ID to extract plan ID and feature number.
 * Format: "<planId>#<featureNumber>"
 */
function parseTaskId(taskId: string): { planId: string; featureNumber: number } | null {
  const match = taskId.match(/^(.+)#(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    planId: match[1],
    featureNumber: parseInt(match[2], 10),
  };
}

/**
 * Try to auto-create a task entry from the plan document.
 * Returns the task state if found in the plan, null otherwise.
 *
 * @param taskId - Task identifier
 * @param context - Tool context
 * @returns Task state or null if not found
 */
async function tryAutoCreateTaskFromPlan(
  taskId: string,
  context: ToolContext
): Promise<TaskState | null> {
  const parsed = parseTaskId(taskId);
  if (!parsed) {
    return null;
  }

  const { planId } = parsed;
  const { plansPath } = context.config;

  // Query database for plan documents matching this plan ID
  const plans = context.db
    .prepare(
      `
    SELECT path, content
    FROM documents
    WHERE path LIKE ?
    AND path LIKE '%/plan.md'
  `
    )
    .all(`${plansPath}%${planId}%`) as { path: string; content: string }[];

  if (plans.length === 0) {
    return null;
  }

  // Find the plan document and parse tasks
  for (const plan of plans) {
    const extractedPlanId = extractPlanId(plan.path);
    if (!extractedPlanId || !extractedPlanId.includes(planId)) {
      continue;
    }

    const tasks = parseTasksFromDocument(plan.path, plan.content, extractedPlanId);
    const task = findTaskById(tasks, taskId);

    if (task) {
      // Create TaskState from parsed task
      return {
        status: task.status,
        claimedBy: undefined,
        dependencies: task.dependencies,
      };
    }
  }

  return null;
}

/**
 * Check if any files are already locked by other agents.
 *
 * @param files - Files to check
 * @param coordination - Coordination state
 * @param agentId - Current agent ID
 * @returns Error message if conflict found, null otherwise
 */
function checkFileLockConflicts(
  files: string[],
  coordination: CoordinationState,
  agentId: string
): string | null {
  for (const file of files) {
    const lockedBy = coordination.fileLocks[file];
    if (lockedBy && lockedBy !== agentId) {
      return `File ${file} is already locked by agent ${lockedBy}`;
    }
  }
  return null;
}

/**
 * Handle claim_task tool request.
 * Marks a task as in-progress by a specific agent with file locks.
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result
 */
export async function handleClaimTask(
  input: z.infer<typeof ClaimTaskInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const { taskId, agentId, persona } = input;
  const coordinationPath = context.config.coordinationPath;

  // Retry loop for optimistic concurrency
  const maxRetries = 5;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      // Read current coordination state
      const coordination = await readCoordination(coordinationPath);
      const expectedVersion = coordination.version;

      // Check if task exists, auto-create if found in plan but not in coordination
      let task = coordination.tasks[taskId];
      if (!task) {
        // Try to auto-create from plan document
        const autoCreatedTask = await tryAutoCreateTaskFromPlan(taskId, context);
        if (!autoCreatedTask) {
          return {
            content: [
              {
                type: 'text',
                text: `Task ${taskId} not found in coordination state or plan documents`,
              },
            ],
            isError: true,
          };
        }

        // Add the auto-created task to coordination state
        coordination.tasks[taskId] = autoCreatedTask;
        task = autoCreatedTask;
      }

      // Check if task is already claimed by a different agent
      if (task.status === 'WIP' && task.claimedBy && task.claimedBy !== agentId) {
        return {
          content: [
            {
              type: 'text',
              text: `Task ${taskId} is already claimed by agent ${task.claimedBy}`,
            },
          ],
          isError: true,
        };
      }

      // If already claimed by same agent, just update heartbeat
      if (task.status === 'WIP' && task.claimedBy === agentId) {
        const agent = coordination.agents[agentId];
        if (agent) {
          // Update heartbeat
          const updatedCoordination: CoordinationState = {
            ...coordination,
            version: coordination.version + 1,
            agents: {
              ...coordination.agents,
              [agentId]: {
                ...agent,
                heartbeat: new Date().toISOString(),
              },
            },
          };

          await writeCoordination(coordinationPath, updatedCoordination, expectedVersion);

          return {
            content: [
              {
                type: 'text',
                text: `Heartbeat updated for task ${taskId}`,
              },
            ],
          };
        }
      }

      // Check if task status allows claiming (must be 'GAP')
      if (task.status !== 'GAP') {
        return {
          content: [
            {
              type: 'text',
              text: `Task ${taskId} cannot be claimed. Current status: ${task.status}`,
            },
          ],
          isError: true,
        };
      }

      // Extract files for this task
      const files = await extractTaskFiles(taskId, context);

      // Check for file lock conflicts
      const conflict = checkFileLockConflicts(files, coordination, agentId);
      if (conflict) {
        return {
          content: [
            {
              type: 'text',
              text: conflict,
            },
          ],
          isError: true,
        };
      }

      // Create file locks
      const fileLocks: Record<string, string> = { ...coordination.fileLocks };
      for (const file of files) {
        fileLocks[file] = agentId;
      }

      // Update coordination state
      const updatedCoordination: CoordinationState = {
        ...coordination,
        version: coordination.version + 1,
        tasks: {
          ...coordination.tasks,
          [taskId]: {
            ...task,
            status: 'WIP',
            claimedBy: agentId,
          },
        },
        agents: {
          ...coordination.agents,
          [agentId]: {
            status: 'WIP',
            persona: persona || 'coder',
            taskId,
            filesLocked: files,
            heartbeat: new Date().toISOString(),
          },
        },
        fileLocks,
      };

      // Write with optimistic concurrency control
      await writeCoordination(coordinationPath, updatedCoordination, expectedVersion);

      return {
        content: [
          {
            type: 'text',
            text: `Task ${taskId} claimed successfully by agent ${agentId}`,
          },
        ],
      };
    } catch (error) {
      // Handle version mismatch (optimistic concurrency conflict)
      if (error instanceof Error && error.message.includes('Version mismatch')) {
        retries++;
        if (retries >= maxRetries) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to claim task after ${maxRetries} retries due to concurrent modifications`,
              },
            ],
            isError: true,
          };
        }
        // Retry with fresh state
        continue;
      }

      // Other errors
      return {
        content: [
          {
            type: 'text',
            text: `Error claiming task: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: `Failed to claim task after ${maxRetries} retries`,
      },
    ],
    isError: true,
  };
}
