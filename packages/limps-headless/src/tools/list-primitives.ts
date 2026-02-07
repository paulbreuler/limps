/**
 * MCP tool for listing all available Radix UI primitives.
 */

import { z } from 'zod';
import type { ExtensionTool } from '@sudosandwich/limps/extensions';
import { listPrimitives, resolvePackage } from '../fetcher/index.js';
import { getProvider } from '../providers/registry.js';

/**
 * Input schema for headless_list_primitives tool.
 */
export const listPrimitivesInputSchema = z.object({
  version: z.string().optional().default('latest').describe('Radix version (default: latest)'),
  provider: z
    .string()
    .optional()
    .default('radix')
    .describe('Component library provider (default: radix)'),
});

export type ListPrimitivesInput = z.infer<typeof listPrimitivesInputSchema>;

/**
 * Output schema for headless_list_primitives tool.
 */
export interface ListPrimitivesOutput {
  version: string;
  primitives: {
    name: string;
    package: string;
    description?: string;
  }[];
}

/**
 * Handler for the headless_list_primitives tool.
 *
 * @param input - Tool input parameters
 * @returns List of primitives with metadata
 */
export async function handleListPrimitives(
  input: unknown
): Promise<{ content: { type: 'text'; text: string }[] }> {
  const parsed = listPrimitivesInputSchema.parse(input);
  const versionHint = parsed.version || 'latest';
  const provider = getProvider(parsed.provider);

  if (provider.name !== 'radix') {
    const resolvedVersion = await provider.resolveVersion(versionHint);
    const primitives = await provider.listPrimitives(resolvedVersion);

    const output: ListPrimitivesOutput = {
      version: resolvedVersion,
      primitives: primitives.map((name) => ({
        name,
        package: provider.name,
      })),
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
    };
  }

  // Detect if unified package is available for this version
  const resolved = await resolvePackage('dialog', versionHint);
  const resolvedVersion = resolved.version;
  const useUnified = resolved.source === 'unified';

  // Get all primitives
  const primitives = await listPrimitives(resolvedVersion);

  const output: ListPrimitivesOutput = {
    version: resolvedVersion,
    primitives: primitives.map((p) => ({
      name: p.name,
      // Use unified package name if available, otherwise individual package
      package: useUnified ? 'radix-ui' : p.package,
      description: p.description,
    })),
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
  };
}

/**
 * MCP tool definition for listing Radix primitives.
 */
export const listPrimitivesTool: ExtensionTool = {
  name: 'headless_list_primitives',
  description: 'List all available Radix UI primitives with their package names and descriptions',
  inputSchema: listPrimitivesInputSchema,
  handler: handleListPrimitives,
};
