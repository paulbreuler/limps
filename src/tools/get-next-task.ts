import { z } from 'zod';
import { getNextTaskData } from '../cli/next-task.js';
import type { ToolContext, ToolResult } from '../types.js';

/**
 * Input schema for get_next_task tool.
 *
 * Uses scoring algorithm with breakdown:
 * - Dependency Score: 40 points max (all-or-nothing)
 * - Priority Score: 30 points max (based on agent number)
 * - Workload Score: 30 points max (based on file count)
 */
export const GetNextTaskInputSchema = z.object({
  planId: z.string().describe('Plan number or name to search within (e.g., "4" or "0004-feature")'),
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
 * Handle get_next_task tool request.
 * Returns the highest-priority available task based on scoring algorithm.
 *
 * Uses agent frontmatter for status and dependencies.
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result with detailed score breakdown
 */
export async function handleGetNextTask(
  input: z.infer<typeof GetNextTaskInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const { planId } = input;

  const result = await getNextTaskData(context.config, planId);

  if ('error' in result) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              taskId: null,
              message: result.error,
            },
            null,
            2
          ),
        },
      ],
      isError: result.error.includes('not found'),
    };
  }

  const { task, otherAvailableTasks } = result;

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            taskId: task.taskId,
            title: task.title,
            totalScore: task.totalScore,
            dependencyScore: task.dependencyScore,
            priorityScore: task.priorityScore,
            workloadScore: task.workloadScore,
            reasons: task.reasons,
            otherAvailableTasks,
          },
          null,
          2
        ),
      },
    ],
  };
}
