/**
 * MCP tool for comparing two Radix versions for breaking changes.
 */

import { z } from 'zod';
import type { ExtensionTool } from '@sudosandwich/limps/extensions';
import { diffVersions, type RadixDiff } from '../differ/index.js';

/**
 * Input schema for radix_diff_versions tool.
 */
export const diffVersionsInputSchema = z.object({
  fromVersion: z
    .string()
    .describe('Starting Radix version to compare from'),
  toVersion: z
    .string()
    .optional()
    .default('latest')
    .describe('Ending Radix version to compare to (default: latest)'),
  primitives: z
    .array(z.string())
    .optional()
    .describe('Optional list of primitives to diff (default: all)'),
  breakingOnly: z
    .boolean()
    .optional()
    .default(false)
    .describe('Only show breaking changes (default: false)'),
});

export type DiffVersionsInput = z.infer<typeof diffVersionsInputSchema>;

/**
 * Output type for radix_diff_versions tool.
 */
export type DiffVersionsOutput = RadixDiff;

/**
 * Handler for the radix_diff_versions tool.
 */
export async function handleDiffVersions(
  input: unknown
): Promise<{ content: { type: 'text'; text: string }[] }> {
  const parsed = diffVersionsInputSchema.parse(input);

  // Perform the diff
  const diff = await diffVersions(
    parsed.fromVersion,
    parsed.toVersion,
    parsed.primitives
  );

  // Filter to breaking only if requested
  let output: RadixDiff = diff;
  if (parsed.breakingOnly) {
    const breakingChanges = diff.changes.filter((c) => c.severity === 'breaking');
    output = {
      ...diff,
      changes: breakingChanges,
      summary: {
        ...diff.summary,
        totalChanges: breakingChanges.length,
        warnings: 0,
        info: 0,
      },
    };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
  };
}

/**
 * MCP tool definition for comparing Radix versions.
 */
export const diffVersionsTool: ExtensionTool = {
  name: 'radix_diff_versions',
  description:
    'Compare two Radix versions for breaking changes, warnings, and new features. Shows what changed between versions with migration hints.',
  inputSchema: diffVersionsInputSchema,
  handler: handleDiffVersions,
};
