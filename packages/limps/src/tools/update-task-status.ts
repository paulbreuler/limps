import { z } from 'zod';
import type { ToolContext, ToolResult, NextStep } from '../types.js';
import { findAgentFilePath, readAgentFile, updateAgentFrontmatter } from '../agent-parser.js';
import { toJsonText } from '../utils/tool-response.js';
import { runHooks } from '../hooks/runner.js';

/**
 * Input schema for update_task_status tool.
 */
export const UpdateTaskStatusInputSchema = z.object({
  taskId: z.string(),
  status: z.enum(['GAP', 'WIP', 'PASS', 'BLOCKED']),
  agentId: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Handle update_task_status tool request.
 * Updates agent file frontmatter status field (GAP, WIP, PASS, or BLOCKED).
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result
 */
export async function handleUpdateTaskStatus(
  input: z.infer<typeof UpdateTaskStatusInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const { taskId, status, agentId, notes } = input;
  const { plansPath } = context.config;

  // Find agent file path
  const agentFilePath = findAgentFilePath(plansPath, taskId);
  if (!agentFilePath) {
    return {
      content: [
        {
          type: 'text',
          text: `Agent file not found for task ${taskId}. Expected format: planFolder#agentNumber (e.g., "0001-feature-name#005")`,
        },
      ],
      isError: true,
    };
  }

  // Read current agent file
  const agent = readAgentFile(agentFilePath);
  if (!agent) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to read agent file: ${agentFilePath}`,
        },
      ],
      isError: true,
    };
  }

  // Capture old status before updating
  const oldStatus = agent.frontmatter.status;

  // Update status in frontmatter
  const updated = updateAgentFrontmatter(agentFilePath, { status });
  if (!updated) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to update agent file frontmatter: ${agentFilePath}`,
        },
      ],
      isError: true,
    };
  }

  // Fire agent:status-changed hook (non-blocking)
  void runHooks(
    'agent:status-changed',
    { taskId, previousStatus: oldStatus, newStatus: status, agentFilePath },
    context.config.hooksPath
  );

  // Recommend next action based on new status
  const nextSteps: NextStep[] = [];
  if (status === 'WIP') {
    nextSteps.push({
      tool: 'get_next_task',
      reason: 'After finishing this task, get the next one',
      params: { planId: taskId.split('#')[0] },
    });
  } else if (status === 'PASS') {
    nextSteps.push({
      tool: 'get_plan_status',
      reason: 'Check overall plan completion after marking task as PASS',
      params: { planId: taskId.split('#')[0] },
    });
  }

  return {
    content: [
      {
        type: 'text',
        text: toJsonText(
          {
            taskId,
            previousStatus: oldStatus,
            newStatus: status,
            updated: true,
            ...(agentId ? { agentId } : {}),
            ...(notes ? { notes } : {}),
          },
          nextSteps
        ),
      },
    ],
  };
}
