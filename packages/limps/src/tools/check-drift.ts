/**
 * MCP tool: check_drift
 *
 * Checks for code drift between agent frontmatter file lists and actual filesystem.
 * Detects missing files and suggests possible renames via fuzzy matching.
 */

import { z } from 'zod';
import { checkFileDrift } from '../cli/health-drift.js';
import type { ToolContext, ToolResult } from '../types.js';

/**
 * Input schema for check_drift tool.
 */
export const CheckDriftInputSchema = z.object({
  planId: z.string().describe('Plan number or name (e.g., "4" or "0004-feature-name")'),
  codebasePath: z
    .string()
    .describe('Root path of the codebase to check files against (absolute path)'),
  agentNumber: z
    .string()
    .optional()
    .describe('Optional specific agent number to check (e.g., "000")'),
});

/**
 * Handle check_drift tool request.
 * Compares files listed in agent frontmatter against actual filesystem.
 *
 * @param input - Tool input with planId, codebasePath, and optional agentNumber
 * @param context - Tool context with config
 * @returns Tool result with drift report or error
 */
export async function handleCheckDrift(
  input: z.infer<typeof CheckDriftInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const result = checkFileDrift(
    context.config,
    input.planId,
    input.codebasePath,
    input.agentNumber
  );

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

  // Build summary
  const summary = {
    status: result.drifts.length === 0 ? 'clean' : 'drift_detected',
    agentsChecked: result.agentsChecked,
    totalFilesChecked: result.totalFilesChecked,
    skippedExternal: result.skippedExternal,
    driftCount: result.drifts.length,
    drifts: result.drifts.map((d) => ({
      taskId: d.taskId,
      agentNumber: d.agentNumber,
      agentTitle: d.agentTitle,
      file: d.listedFile,
      reason: d.reason,
      suggestion: d.suggestion,
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
