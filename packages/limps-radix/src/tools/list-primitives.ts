/**
 * MCP tool for listing all available Radix UI primitives.
 */

import { z } from 'zod';
import type { ExtensionTool } from '@sudosandwich/limps/extensions';
import { listPrimitives, resolvePackage } from '../fetcher/index.js';

/**
 * Input schema for radix_list_primitives tool.
 */
export const listPrimitivesInputSchema = z.object({
  version: z
    .string()
    .optional()
    .default('latest')
    .describe('Radix version (default: latest)'),
});

export type ListPrimitivesInput = z.infer<typeof listPrimitivesInputSchema>;

/**
 * Output schema for radix_list_primitives tool.
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
 * Handler for the radix_list_primitives tool.
 *
 * @param input - Tool input parameters
 * @returns List of primitives with metadata
 */
export async function handleListPrimitives(
  input: unknown
): Promise<{ content: { type: 'text'; text: string }[] }> {
  const parsed = listPrimitivesInputSchema.parse(input);
  const versionHint = parsed.version || 'latest';

  // Resolve the version for a reference primitive (dialog is a good baseline)
  const resolved = await resolvePackage('dialog', versionHint);
  const resolvedVersion = resolved.version;

  // Get all primitives
  const primitives = await listPrimitives(resolvedVersion);

  const output: ListPrimitivesOutput = {
    version: resolvedVersion,
    primitives: primitives.map((p) => ({
      name: p.name,
      package: p.package,
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
  name: 'radix_list_primitives',
  description:
    'List all available Radix UI primitives with their package names and descriptions',
  inputSchema: listPrimitivesInputSchema,
  handler: handleListPrimitives,
};
