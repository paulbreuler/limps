import { z } from 'zod';
import { readCoordination, writeCoordination, type CoordinationState } from '../coordination.js';
import type { ToolContext, ToolResult } from '../types.js';

/**
 * Input schema for release_task tool.
 */
export const ReleaseTaskInputSchema = z.object({
  taskId: z.string(),
  agentId: z.string(),
  finalStatus: z.enum(['PASS', 'BLOCKED']).optional(),
});

/**
 * Handle release_task tool request.
 * Frees a task and associated file locks when agent completes or abandons work.
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result
 */
export async function handleReleaseTask(
  input: z.infer<typeof ReleaseTaskInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const { taskId, agentId, finalStatus } = input;
  const coordinationPath = context.config.coordinationPath;

  // Retry loop for optimistic concurrency
  const maxRetries = 5;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      // Read current coordination state
      const coordination = await readCoordination(coordinationPath);
      const expectedVersion = coordination.version;

      // Check if task exists
      const task = coordination.tasks[taskId];
      if (!task) {
        return {
          content: [
            {
              type: 'text',
              text: `Task ${taskId} not found in coordination state`,
            },
          ],
          isError: true,
        };
      }

      // Security check: verify agent owns the task
      if (task.claimedBy !== agentId) {
        return {
          content: [
            {
              type: 'text',
              text: `Task ${taskId} is not claimed by agent ${agentId}. Current owner: ${task.claimedBy || 'none'}`,
            },
          ],
          isError: true,
        };
      }

      // Get agent state
      const agent = coordination.agents[agentId];
      if (!agent) {
        return {
          content: [
            {
              type: 'text',
              text: `Agent ${agentId} not found in coordination state`,
            },
          ],
          isError: true,
        };
      }

      // Get files to unlock
      const filesToUnlock = agent.filesLocked || [];

      // Remove file locks (even if task status update fails later)
      const fileLocks: Record<string, string> = Object.fromEntries(
        Object.entries(coordination.fileLocks).filter(([file]) => !filesToUnlock.includes(file))
      );

      // Determine new task status
      const newTaskStatus = finalStatus || 'GAP';

      // Update coordination state
      const updatedCoordination: CoordinationState = {
        ...coordination,
        version: coordination.version + 1,
        tasks: {
          ...coordination.tasks,
          [taskId]: {
            ...task,
            status: newTaskStatus,
            claimedBy: undefined,
          },
        },
        agents: {
          ...coordination.agents,
          [agentId]: {
            ...agent,
            status: 'idle',
            taskId: undefined,
            filesLocked: [],
          },
        },
        fileLocks,
      };

      // Write with optimistic concurrency control
      await writeCoordination(coordinationPath, updatedCoordination, expectedVersion);

      // Check dependent tasks for unblocking (if task status becomes 'PASS')
      if (newTaskStatus === 'PASS') {
        // TODO: Check if any tasks depend on this task and unblock them
        // This would require querying tasks to find dependencies
      }

      const statusMessage = finalStatus ? ` with status ${finalStatus}` : '';
      return {
        content: [
          {
            type: 'text',
            text: `Task ${taskId} released successfully${statusMessage}`,
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
                text: `Failed to release task after ${maxRetries} retries due to concurrent modifications`,
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
            text: `Error releasing task: ${error instanceof Error ? error.message : String(error)}`,
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
        text: `Failed to release task after ${maxRetries} retries`,
      },
    ],
    isError: true,
  };
}
