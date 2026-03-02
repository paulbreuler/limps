/**
 * MCP tool: list_plans
 *
 * Lists all plans with structured data for LLM consumption.
 * Wraps the CLI getPlansData() function to provide consistent experience.
 */

import { z } from 'zod';
import { existsSync } from 'fs';
import { getPlansData } from '../cli/list-plans.js';
import type { ToolContext, ToolResult } from '../types.js';
import { toJsonText } from '../utils/tool-response.js';

/**
 * Input schema for list_plans tool.
 * Currently accepts no parameters but schema is extensible.
 */
export const ListPlansInputSchema = z.object({
  prettyPrint: z
    .boolean()
    .default(false)
    .describe('Format JSON response with indentation (default: false)'),
});

/**
 * Handle list_plans tool request.
 * Returns all plans with number, name, workType, overview, and status.
 *
 * @param _input - Tool input (currently unused)
 * @param context - Tool context with config
 * @returns Tool result with plan list or error
 */
export async function handleListPlans(
  input: z.infer<typeof ListPlansInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const { prettyPrint = false } = input;

  if (!existsSync(context.config.plansPath)) {
    return {
      content: [
        {
          type: 'text',
          text: `plansPath does not exist: ${context.config.plansPath}. Configure a valid plansPath in your limps config.`,
        },
      ],
      isError: true,
    };
  }

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
        text: toJsonText(
          result as unknown as Record<string, unknown>,
          [
            {
              tool: 'list_agents',
              reason: 'View agents and task status for a specific plan',
            },
            {
              tool: 'get_next_task',
              reason: 'Get the highest-priority task across any plan',
            },
          ],
          prettyPrint
        ),
      },
    ],
  };
}
