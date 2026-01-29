/**
 * MCP tool for analyzing local React components against Radix signatures.
 */

import { z } from 'zod';
import { rcompare, valid as validSemver } from 'semver';
import * as path from 'node:path';
import type { ExtensionTool } from '@sudosandwich/limps/extensions';
import { analyzeComponent, scoreAgainstSignatures, disambiguate, isAmbiguous } from '../analyzer/index.js';
import { getSignatureFromCache, getLatestResolution } from '../cache/index.js';
import { listCachedPrimitives, listCachedVersions } from '../cache/storage.js';
import type { AnalysisResult, BehaviorSignature } from '../types/index.js';

/**
 * Input schema for radix_analyze_component tool.
 */
export const analyzeComponentInputSchema = z.object({
  filePath: z.string().describe('Path to .tsx component file'),
  radixVersion: z
    .string()
    .optional()
    .default('latest')
    .describe('Radix version to compare against (default: latest)'),
  threshold: z
    .number()
    .optional()
    .default(40)
    .describe('Minimum confidence score to include in results (default: 40)'),
});

export type AnalyzeComponentInput = z.infer<typeof analyzeComponentInputSchema>;

function serializeAnalysis(analysis: AnalysisResult['analysis']) {
  return {
    ...analysis,
    propsInterface: Object.fromEntries(analysis.propsInterface.entries()),
  };
}

function resolveAndValidatePath(filePath: string): { absolute: string; relative: string } {
  const resolved = path.resolve(filePath);
  const cwd = process.cwd();
  const relative = path.relative(cwd, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('filePath must be within the project directory');
  }

  if (!resolved.endsWith('.tsx')) {
    throw new Error('filePath must point to a .tsx file');
  }

  return { absolute: resolved, relative };
}

/**
 * Handler for the radix_analyze_component tool.
 *
 * @param input - Tool input parameters
 * @returns Analysis result with recommendation and matches
 */
export async function handleAnalyzeComponent(
  input: unknown
): Promise<{ content: { type: 'text'; text: string }[] }> {
  const parsed = analyzeComponentInputSchema.parse(input);
  const { filePath, radixVersion, threshold } = parsed;
  const { absolute, relative } = resolveAndValidatePath(filePath);

  // Analyze the component
  const analysis = await analyzeComponent(absolute);

  // Resolve version if "latest"
  let resolvedVersion = radixVersion;
  if (radixVersion === 'latest') {
    // Try to get a known primitive's latest resolution, or use the most recent cached version
    const latestResolution = await getLatestResolution('dialog');
    if (latestResolution) {
      resolvedVersion = latestResolution.version;
    } else {
      // Fallback: use the most recent cached version
      const versions = await listCachedVersions();
      if (versions.length > 0) {
        const validVersions = versions.filter((version) => validSemver(version));
        if (validVersions.length > 0) {
          resolvedVersion = validVersions.sort(rcompare)[0];
        } else {
          // Fallback to lexicographic sort when no valid semver strings are present
          resolvedVersion = versions.sort().reverse()[0];
        }
      } else {
        // No cached versions - return early
        const result: AnalysisResult = {
          component: analysis.name,
          filePath: relative,
          recommendation: {
            primitive: null,
            package: null,
            confidence: 0,
            action: 'CUSTOM_OK',
            reason: 'No Radix signatures cached. Run radix_extract_primitive first.',
          },
          matches: [],
          analysis,
          isAmbiguous: false,
        };
        const serializableResult = {
          ...result,
          analysis: serializeAnalysis(result.analysis),
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(serializableResult, null, 2) }],
        };
      }
    }
  }

  // Get all cached primitives for the resolved version
  const primitives = await listCachedPrimitives(resolvedVersion);
  const signatures: BehaviorSignature[] = [];

  for (const primitive of primitives) {
    const signature = await getSignatureFromCache(primitive, resolvedVersion);
    if (signature) {
      signatures.push(signature);
    }
  }

  // If no signatures found, return early with CUSTOM_OK
  if (signatures.length === 0) {
    const result: AnalysisResult = {
      component: analysis.name,
      filePath: relative,
      recommendation: {
        primitive: null,
        package: null,
        confidence: 0,
        action: 'CUSTOM_OK',
        reason: 'No Radix signatures available for comparison',
      },
      matches: [],
      analysis,
      isAmbiguous: false,
    };

    const serializableResult = {
      ...result,
      analysis: serializeAnalysis(result.analysis),
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(serializableResult, null, 2) }],
    };
  }

  // Score against all signatures
  const matches = scoreAgainstSignatures(analysis, signatures);

  // Filter by threshold
  const filteredMatches = matches.filter((m) => m.confidence >= threshold);

  // Disambiguate if needed
  const ambiguous = isAmbiguous(filteredMatches);
  const bestMatch = filteredMatches.length > 0 
    ? disambiguate(filteredMatches, analysis)
    : null;

  // Determine recommendation
  let recommendation: AnalysisResult['recommendation'];
  if (!bestMatch || bestMatch.confidence < 50) {
    recommendation = {
      primitive: null,
      package: null,
      confidence: bestMatch?.confidence ?? 0,
      action: 'CUSTOM_OK',
      reason: bestMatch
        ? `Low confidence (${bestMatch.confidence}) - component likely custom`
        : 'No matches found',
    };
  } else if (bestMatch.confidence >= 70) {
    recommendation = {
      primitive: bestMatch.primitive,
      package: bestMatch.package,
      confidence: bestMatch.confidence,
      action: 'ADOPT_RADIX',
      reason: `High confidence match (${bestMatch.confidence}) - strongly recommend adopting ${bestMatch.primitive}`,
    };
  } else {
    recommendation = {
      primitive: bestMatch.primitive,
      package: bestMatch.package,
      confidence: bestMatch.confidence,
      action: 'CONSIDER_RADIX',
      reason: `Moderate confidence match (${bestMatch.confidence}) - consider adopting ${bestMatch.primitive}`,
    };
  }

  const result: AnalysisResult = {
    component: analysis.name,
    filePath: relative,
    recommendation,
    matches: filteredMatches,
    analysis,
    isAmbiguous: ambiguous,
  };

  const serializableResult = {
    ...result,
    analysis: serializeAnalysis(result.analysis),
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(serializableResult, null, 2) }],
  };
}

/**
 * MCP tool definition for analyzing a React component.
 */
export const analyzeComponentTool: ExtensionTool = {
  name: 'radix_analyze_component',
  description:
    'Analyze a React component file for Radix primitive adoption. Returns confidence scores, matches, and recommendations.',
  inputSchema: analyzeComponentInputSchema,
  handler: handleAnalyzeComponent,
};
