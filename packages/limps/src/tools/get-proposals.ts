/**
 * MCP tool: get_proposals
 *
 * Returns update proposals generated from staleness, drift, and inference.
 * Proposals are for human review; use apply_proposal to apply with confirmation.
 */

import { z } from 'zod';
import { getProposals } from '../cli/proposals.js';
import type { ToolContext, ToolResult } from '../types.js';

const proposalTypeEnum = z.enum(['frontmatter', 'status', 'content', 'file_list']);

export const GetProposalsInputSchema = z.object({
  planId: z.string().optional().describe('Plan number or name to scope proposals'),
  types: z.array(proposalTypeEnum).optional().describe('Filter by proposal type'),
  minConfidence: z.number().min(0).max(1).optional().describe('Minimum confidence 0–1 to include'),
  autoApplyableOnly: z.boolean().optional().describe('Only return proposals safe to auto-apply'),
  codebasePath: z
    .string()
    .optional()
    .describe('Path to codebase (required for drift/file_list proposals)'),
});

export async function handleGetProposals(
  input: z.infer<typeof GetProposalsInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const result = getProposals(context.config, {
    planId: input.planId,
    types: input.types,
    minConfidence: input.minConfidence,
    autoApplyableOnly: input.autoApplyableOnly,
    codebasePath: input.codebasePath,
  });

  if (result.error) {
    return {
      content: [{ type: 'text', text: result.error }],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { proposals: result.proposals, count: result.proposals.length },
          null,
          2
        ),
      },
    ],
  };
}
