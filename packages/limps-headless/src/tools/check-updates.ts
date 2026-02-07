/**
 * MCP tool for checking for new Radix releases and showing changes.
 */

import { z } from 'zod';
import type { ExtensionTool } from '@sudosandwich/limps/extensions';
import { diffVersions, type UpdateCheckResult } from '../differ/index.js';
import { getLatestResolution, saveLatestResolution, clearCache } from '../cache/index.js';
import { resolvePackageVersion } from '../fetcher/npm-registry.js';
import { getProvider } from '../providers/registry.js';

/**
 * Input schema for headless_check_updates tool.
 */
export const checkUpdatesInputSchema = z.object({
  refreshCache: z
    .boolean()
    .optional()
    .default(false)
    .describe('Force refresh the cache with latest data (default: false)'),
  primitives: z
    .array(z.string())
    .optional()
    .describe('Optional list of primitives to check (default: all)'),
  provider: z
    .string()
    .optional()
    .default('radix')
    .describe('Component library provider (default: radix)'),
});

export type CheckUpdatesInput = z.infer<typeof checkUpdatesInputSchema>;

/**
 * Output type for headless_check_updates tool.
 */
export type CheckUpdatesOutput = UpdateCheckResult;

/**
 * Reference primitive for version resolution.
 * Dialog is stable and widely used.
 */
const REFERENCE_PRIMITIVE = 'dialog';

/**
 * Handler for the headless_check_updates tool.
 */
export async function handleCheckUpdates(
  input: unknown
): Promise<{ content: { type: 'text'; text: string }[] }> {
  const parsed = checkUpdatesInputSchema.parse(input);
  const provider = getProvider(parsed.provider);
  if (provider.name !== 'radix') {
    throw new Error(`Provider "${provider.name}" is not supported for update checks yet`);
  }

  // If refresh requested, clear the cache first
  if (parsed.refreshCache) {
    await clearCache();
  }

  // Get the cached "current" version
  const cachedResolution = await getLatestResolution(REFERENCE_PRIMITIVE);
  const currentVersion = cachedResolution?.version;

  // Resolve the actual latest version from npm
  const packageName = `@radix-ui/react-${REFERENCE_PRIMITIVE}`;
  const latestVersion = await resolvePackageVersion(packageName, 'latest');

  // Determine if there's an update
  // Only report an update if we have a cached version AND it differs from latest
  const hasUpdate = currentVersion !== undefined && currentVersion !== latestVersion;

  // Build result
  const result: UpdateCheckResult = {
    currentVersion: currentVersion ?? latestVersion,
    latestVersion,
    hasUpdate,
  };

  // If there's an update, generate diff
  if (hasUpdate) {
    result.diff = await diffVersions(
      currentVersion!, // Safe: hasUpdate implies currentVersion is defined
      latestVersion,
      parsed.primitives
    );
  }

  // Update the cached resolution to latest
  await saveLatestResolution(REFERENCE_PRIMITIVE, latestVersion);

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

/**
 * MCP tool definition for checking Radix updates.
 */
export const checkUpdatesTool: ExtensionTool = {
  name: 'headless_check_updates',
  description:
    'Check for new Radix releases and automatically show changes since the last check. Use refreshCache to force re-extraction of signatures.',
  inputSchema: checkUpdatesInputSchema,
  handler: handleCheckUpdates,
};
