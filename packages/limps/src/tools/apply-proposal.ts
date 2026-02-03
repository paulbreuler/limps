/**
 * MCP tool: apply_proposal
 *
 * Applies a single proposal by id. Requires confirm: true.
 * Creates a backup before modifying the file.
 */

import { z } from 'zod';
import { applyProposal } from '../cli/proposals.js';
import type { ToolContext, ToolResult } from '../types.js';

export const ApplyProposalInputSchema = z.object({
  proposalId: z.string().describe('Id of the proposal (from get_proposals)'),
  confirm: z.literal(true).describe('Must be true to apply; safety check'),
  planId: z
    .string()
    .optional()
    .describe('Optional plan id to scope proposal lookup when regenerating'),
});

export async function handleApplyProposal(
  input: z.infer<typeof ApplyProposalInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const result = applyProposal(context.config, input.proposalId, input.confirm, input.planId);

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
          { applied: result.applied, path: result.path, backup: result.backup },
          null,
          2
        ),
      },
    ],
  };
}
