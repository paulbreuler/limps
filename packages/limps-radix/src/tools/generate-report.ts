/**
 * MCP tool for generating an audit report from precomputed analysis/diff/updates JSON.
 */

import { z } from 'zod';
import type { ExtensionTool } from '@sudosandwich/limps/extensions';
import { generateReport } from '../audit/generate-report.js';

export const generateReportInputSchema = z.object({
  inputs: z.object({
    analysis: z.string().optional().describe('Path to analysis JSON'),
    diff: z.string().optional().describe('Path to diff JSON'),
    checkUpdates: z.string().optional().describe('Path to update-check JSON'),
  }),
  outputDir: z.string().optional().describe('Output directory'),
  format: z.enum(['json', 'markdown', 'both']).optional().default('both'),
  title: z.string().optional().describe('Report title'),
});

export type GenerateReportInput = z.infer<typeof generateReportInputSchema>;

export async function handleGenerateReport(
  input: unknown
): Promise<{ content: { type: 'text'; text: string }[] }> {
  const parsed = generateReportInputSchema.parse(input);
  const result = generateReport(parsed);
  const summary = {
    outputDir: result.outputDir,
    jsonPath: result.jsonPath,
    markdownPath: result.markdownPath,
    summary: result.report.summary,
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
  };
}

export const generateReportTool: ExtensionTool = {
  name: 'radix_generate_report',
  description:
    'Generate an audit report from precomputed analysis, diff, and/or update-check JSON. Outputs JSON and/or Markdown.',
  inputSchema: generateReportInputSchema,
  handler: handleGenerateReport,
};
