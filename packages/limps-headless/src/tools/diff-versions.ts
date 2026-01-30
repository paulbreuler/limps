/**
 * MCP tool: diff two Radix versions (not your code vs Radix).
 *
 * Compares primitive API contracts (props, subcomponents) between a
 * from-version and a to-version. Use to see what breaks when upgrading;
 * reports breaking changes, warnings, and info.
 */

import { z } from 'zod';
import type { ExtensionTool } from '@sudosandwich/limps/extensions';
import { diffVersions, type RadixDiff } from '../differ/index.js';
import { getProvider } from '../providers/registry.js';

/**
 * Input schema for radix_diff_versions tool.
 */
export const diffVersionsInputSchema = z.object({
  fromVersion: z
    .string()
    .describe('From Radix version (e.g. your current version)'),
  toVersion: z
    .string()
    .optional()
    .default('latest')
    .describe('To Radix version (e.g. latest; default: latest)'),
  primitives: z
    .array(z.string())
    .optional()
    .describe('Optional list of primitives to diff (default: all)'),
  breakingOnly: z
    .boolean()
    .optional()
    .default(false)
    .describe('Only show breaking changes (default: false)'),
  provider: z
    .string()
    .optional()
    .default('radix')
    .describe('Component library provider (default: radix)'),
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
  const provider = getProvider(parsed.provider);
  if (provider.name !== 'radix') {
    throw new Error(`Provider "${provider.name}" is not supported for diffing yet`);
  }

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
        breaking: breakingChanges.length,
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
    'Diff two Radix versions (from-version → to-version): compare for breaking changes, warnings, and new features. Shows what changed with migration hints.',
  inputSchema: diffVersionsInputSchema,
  handler: handleDiffVersions,
};
