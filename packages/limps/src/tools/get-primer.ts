import { z } from 'zod';
import { join, resolve } from 'path';
import { resolvePrimer } from '../documents/primer-resolver.js';
import type { ToolContext, ToolResult } from '../types.js';

export const GetPrimerInputSchema = z.object({
  planId: z.string().min(1).describe('Plan directory name (e.g., "0001-feature-name")'),
  overridePath: z.string().optional().describe('Override primer file path'),
});

export async function getPrimerHandler(
  args: z.infer<typeof GetPrimerInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const { config } = context;
  const plansPath = config.workspacePath ?? config.plansPath;

  const planDir = resolve(join(plansPath, args.planId));
  const result = resolvePrimer(planDir, config, args.overridePath);

  const output = result
    ? { resolved: true, path: result.path, content: result.content, source: result.source }
    : { resolved: false, path: null, content: null, source: 'none' };

  return {
    content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
  };
}
