import { z } from 'zod';
import {
  readCoordination,
  writeCoordination,
  type CoordinationState,
  type TaskState,
} from '../coordination.js';
import {
  parseTaskId as parseAgentTaskId,
  findAgentFilePath,
  readAgentFile,
} from '../agent-parser.js';
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
 * Extract files from agent file frontmatter.
 *
 * @param taskId - Task identifier (format: planFolder#agentNumber)
 * @param context - Tool context
 * @returns Array of file paths
 */
async function extractTaskFiles(taskId: string, context: ToolContext): Promise<string[]> {
  const agentFilePath = findAgentFilePath(context.config.plansPath, taskId);
  if (!agentFilePath) {
    return [];
  }

  const agentFile = readAgentFile(agentFilePath);
  if (!agentFile) {
    return [];
  }

  return agentFile.frontmatter.files;
}

/**
 * Try to auto-create a task entry from an agent file.
 * Returns the task state if found in the agent file, null otherwise.
 *
 * @param taskId - Task identifier (format: planFolder#agentNumber)
 * @param context - Tool context
 * @returns Task state or null if not found
 */
async function tryAutoCreateTaskFromAgent(
  taskId: string,
  context: ToolContext
): Promise<TaskState | null> {
  const parsed = parseAgentTaskId(taskId);
  if (!parsed) {
    return null;
  }

  const { planFolder } = parsed;
  const agentFilePath = findAgentFilePath(context.config.plansPath, taskId);

  if (!agentFilePath) {
    return null;
  }

  const agentFile = readAgentFile(agentFilePath);
  if (!agentFile) {
    return null;
  }

  // Convert agent number dependencies to full task IDs
  const dependencies = agentFile.frontmatter.dependencies.map((dep) => {
    // If it's already a full task ID, return as-is
    if (dep.includes('#')) {
      return dep;
    }
    // Otherwise, it's an agent number - convert to full task ID
    return `${planFolder}#${dep}`;
  });

  // Create TaskState from agent file frontmatter
  return {
    status: agentFile.frontmatter.status,
    claimedBy: agentFile.frontmatter.claimedBy || undefined,
    dependencies,
  };
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

      // Check if task exists, auto-create from agent file if not in coordination
      let task = coordination.tasks[taskId];
      if (!task) {
        // Try to auto-create from agent file
        const autoCreatedTask = await tryAutoCreateTaskFromAgent(taskId, context);

        if (!autoCreatedTask) {
          return {
            content: [
              {
                type: 'text',
                text: `Task ${taskId} not found in coordination state or agent files`,
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
