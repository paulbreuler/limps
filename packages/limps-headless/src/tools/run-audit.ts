/**
 * MCP tool for running a full Radix audit (analysis + diff + report).
 */

import { z } from 'zod';
import type { ExtensionTool } from '@sudosandwich/limps/extensions';
import { runAudit } from '../audit/run-audit.js';

export const runAuditInputSchema = z.object({
  scope: z
    .object({
      files: z.array(z.string()).optional().describe('File paths to analyze'),
      primitives: z.array(z.string()).optional().describe('Primitives subset'),
      provider: z.string().optional().default('radix'),
    })
    .optional(),
  discovery: z
    .object({
      rootDir: z.string().optional().describe('Root directory for discovery'),
      includePatterns: z.array(z.string()).optional().describe('File include patterns'),
      excludePatterns: z.array(z.string()).optional().describe('File exclude patterns'),
    })
    .optional(),
  radixVersion: z.string().optional().default('latest').describe('Radix version (default: latest)'),
  outputDir: z.string().optional().default('.limps-headless/reports').describe('Output directory'),
  format: z.enum(['json', 'markdown', 'both']).optional().default('both'),
});

export type RunAuditInput = z.infer<typeof runAuditInputSchema>;

export async function handleRunAudit(
  input: unknown
): Promise<{ content: { type: 'text'; text: string }[] }> {
  const parsed = runAuditInputSchema.parse(input);
  const result = await runAudit(parsed);
  const summary = {
    outputDir: result.outputDir,
    jsonPath: result.jsonPath,
    markdownPath: result.markdownPath,
    analysisPath: result.analysisPath,
    diffPath: result.diffPath,
    updatesPath: result.updatesPath,
    inventoryPath: result.inventoryPath,
    summary: result.report.summary,
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
  };
}

export const runAuditTool: ExtensionTool = {
  name: 'radix_run_audit',
  description:
    'Run a full Radix audit: discover components (if no files), analyze against Radix, diff versions, check updates, and generate JSON + Markdown report.',
  inputSchema: runAuditInputSchema,
  handler: handleRunAudit,
};
