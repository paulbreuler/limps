/**
 * MCP tool: infer_status
 *
 * Suggests status updates for plan agents based on conservative rules.
 * Inference is suggest-only; never auto-applies.
 */

import { z } from 'zod';
import { inferStatus } from '../cli/health-inference.js';
import type { ToolContext, ToolResult } from '../types.js';

export const InferStatusInputSchema = z.object({
  planId: z.string().describe('Plan number or name (e.g., "33" or "0033-limps-self-updating")'),
  agentNumber: z
    .string()
    .optional()
    .describe('Optional specific agent number to infer (e.g., "000")'),
  minConfidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Minimum confidence 0–1 to include suggestions (default 0)'),
});

export async function handleInferStatus(
  input: z.infer<typeof InferStatusInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const result = inferStatus(context.config, input.planId, {
    agentNumber: input.agentNumber,
    minConfidence: input.minConfidence,
  });

  if (result.error) {
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

  const summary = {
    agentsChecked: result.agentsChecked,
    suggestionCount: result.suggestions.length,
    suggestions: result.suggestions.map((s) => ({
      taskId: s.taskId,
      agentNumber: s.agentNumber,
      agentTitle: s.agentTitle,
      currentStatus: s.currentStatus,
      suggestedStatus: s.suggestedStatus,
      confidence: s.confidence,
      reasons: s.reasons,
    })),
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(summary, null, 2),
      },
    ],
  };
}
