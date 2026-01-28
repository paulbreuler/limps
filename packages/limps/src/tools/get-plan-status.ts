/**
 * MCP tool: get_plan_status
 *
 * Gets plan status summary with completion percentage for LLM consumption.
 * Wraps the CLI getPlanStatusSummary() function to provide consistent experience.
 */

import { z } from 'zod';
import { getPlanStatusSummary } from '../cli/status.js';
import type { ToolContext, ToolResult } from '../types.js';

/**
 * Input schema for get_plan_status tool.
 */
export const GetPlanStatusInputSchema = z.object({
  planId: z.string().describe('Plan number or name (e.g., "4" or "0004-feature-name")'),
});

/**
 * Handle get_plan_status tool request.
 * Returns plan status with completion percentage, counts, and blocked/WIP lists.
 *
 * @param input - Tool input with planId
 * @param context - Tool context with config
 * @returns Tool result with status summary or error
 */
export async function handleGetPlanStatus(
  input: z.infer<typeof GetPlanStatusInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  try {
    const summary = getPlanStatusSummary(context.config, input.planId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
      isError: true,
    };
  }
}
