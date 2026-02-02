/**
 * MCP tool: check_staleness
 *
 * Reports stale plans and agents using staleness policy from config.
 */

import { z } from 'zod';
import { getStalenessReport } from '../cli/health-staleness.js';
import type { ToolContext, ToolResult } from '../types.js';

export const CheckStalenessInputSchema = z.object({
  planId: z.string().optional().describe('Plan number or name to scope the check'),
  thresholdDays: z
    .number()
    .optional()
    .describe('Override warning threshold days for staleness detection'),
  includePass: z.boolean().optional().describe('Include PASS items in output'),
});

export async function handleCheckStaleness(
  input: z.infer<typeof CheckStalenessInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  try {
    const report = getStalenessReport(context.config, input);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(report, null, 2),
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
