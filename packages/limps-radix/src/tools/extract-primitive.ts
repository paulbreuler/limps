/**
 * MCP tool for extracting the full behavioral contract from a Radix primitive.
 */

import { z } from 'zod';
import type { ExtensionTool } from '@sudosandwich/limps/extensions';
import {
  resolvePackage,
  fetchTypesWithFallback,
} from '../fetcher/index.js';
import { extractPrimitive, getPropCategory } from '../extractor/index.js';
import { generateSignature } from '../signatures/index.js';
import {
  getFromCache,
  saveToCache,
  getSignatureFromCache,
  saveSignatureToCache,
} from '../cache/index.js';

/**
 * Input schema for radix_extract_primitive tool.
 */
export const extractPrimitiveInputSchema = z.object({
  primitive: z.string().describe('Primitive name (e.g., "dialog", "popover", "tooltip")'),
  version: z
    .string()
    .optional()
    .default('latest')
    .describe('Radix version (default: latest)'),
});

export type ExtractPrimitiveInput = z.infer<typeof extractPrimitiveInputSchema>;

/**
 * Output schema for radix_extract_primitive tool.
 */
export interface ExtractPrimitiveOutput {
  primitive: string;
  package: string;
  version: string;

  behavior: {
    statePattern: string;
    compositionPattern: string;
    renderingPattern: string;
  };

  subComponents: {
    name: string;
    props: {
      name: string;
      type: string;
      required: boolean;
      default?: string;
      category: 'state' | 'event' | 'config' | 'composition' | 'other';
    }[];
  }[];

  similarTo: string[];
  disambiguationRule?: string;
}

/**
 * Handler for the radix_extract_primitive tool.
 *
 * @param input - Tool input parameters
 * @returns Full primitive contract with behavioral classification
 */
export async function handleExtractPrimitive(
  input: unknown
): Promise<{ content: { type: 'text'; text: string }[] }> {
  const parsed = extractPrimitiveInputSchema.parse(input);
  const primitiveName = parsed.primitive.toLowerCase();
  const versionHint = parsed.version || 'latest';

  // Resolve package source and version
  const resolved = await resolvePackage(primitiveName, versionHint);
  let resolvedContent: Awaited<
    ReturnType<typeof fetchTypesWithFallback>
  > | null = null;

  // Try cache first
  let extracted = await getFromCache(primitiveName, resolved.version);
  let signature = await getSignatureFromCache(primitiveName, resolved.version);

  if (!extracted) {
    // Fetch and extract
    resolvedContent = await fetchTypesWithFallback(
      primitiveName,
      versionHint
    );
    extracted = extractPrimitive(
      resolvedContent.content,
      resolvedContent.resolved.primitive,
      resolvedContent.resolved.version,
      resolvedContent.resolved.packageName
    );

    // Save to cache
    await saveToCache(
      primitiveName,
      resolvedContent.resolved.version,
      extracted
    );
  }

  if (!signature) {
    // Generate signature
    signature = generateSignature(extracted);

    // Save to cache
    const resolvedVersion =
      resolvedContent?.resolved.version ?? resolved.version;
    await saveSignatureToCache(primitiveName, resolvedVersion, signature);
  }

  // Format output
  const resolvedPackage =
    resolvedContent?.resolved ??
    ({
      packageName: extracted.package,
      version: extracted.version,
    } as { packageName: string; version: string });

  const output: ExtractPrimitiveOutput = {
    primitive: extracted.name,
    package: resolvedPackage.packageName,
    version: resolvedPackage.version,

    behavior: {
      statePattern: signature.statePattern,
      compositionPattern: signature.compositionPattern,
      renderingPattern: signature.renderingPattern,
    },

    subComponents: extracted.subComponents.map((sc) => ({
      name: sc.name,
      props: sc.props.map((p) => ({
        name: p.name,
        type: p.type,
        required: p.required,
        default: p.defaultValue,
        category: getPropCategory(p.name),
      })),
    })),

    similarTo: signature.similarTo,
    disambiguationRule: signature.disambiguationRule,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
  };
}

/**
 * MCP tool definition for extracting a Radix primitive's contract.
 */
export const extractPrimitiveTool: ExtensionTool = {
  name: 'radix_extract_primitive',
  description:
    'Extract the behavioral contract from a Radix UI primitive, including sub-components, props, and semantic classification',
  inputSchema: extractPrimitiveInputSchema,
  handler: handleExtractPrimitive,
};
