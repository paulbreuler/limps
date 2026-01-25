/**
 * MCP tool: list_plans
 *
 * Lists all plans with structured data for LLM consumption.
 * Wraps the CLI getPlansData() function to provide consistent experience.
 */

import { z } from 'zod';
import { getPlansData } from '../cli/list-plans.js';
import type { ToolContext, ToolResult } from '../types.js';

/**
 * Input schema for list_plans tool.
 * Currently accepts no parameters but schema is extensible.
 */
export const ListPlansInputSchema = z.object({});

/**
 * Handle list_plans tool request.
 * Returns all plans with number, name, workType, overview, and status.
 *
 * @param _input - Tool input (currently unused)
 * @param context - Tool context with config
 * @returns Tool result with plan list or error
 */
export async function handleListPlans(
  _input: z.infer<typeof ListPlansInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const result = getPlansData(context.config);

  if ('error' in result) {
    return {
      content: [
        {
          type: 'text',
          text: result.error,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
