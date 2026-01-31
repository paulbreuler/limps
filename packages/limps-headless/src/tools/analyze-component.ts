/**
 * MCP tool for analyzing local React components against Radix signatures.
 */

import { z } from 'zod';
import { rcompare, valid as validSemver } from 'semver';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { ExtensionTool } from '@sudosandwich/limps/extensions';
import { analyzeComponent, scoreAgainstSignatures, disambiguate, isAmbiguous } from '../analyzer/index.js';
import { getSignatureFromCache, getLatestResolution } from '../cache/index.js';
import { listCachedPrimitives, listCachedVersions } from '../cache/storage.js';
import type { AnalysisResult, BehaviorSignature } from '../types/index.js';
import { getProvider } from '../providers/registry.js';
import { createModuleGraph } from '../analysis/module-graph.js';
import { baseUiRuleset, evaluateRuleset, radixLegacyRuleset } from '../rules/index.js';

/**
 * Input schema for headless_analyze_component tool.
 */
export const analyzeComponentInputSchema = z.object({
  filePath: z.string().describe('Path to .ts/.tsx component file'),
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
  provider: z
    .string()
    .optional()
    .default('radix')
    .describe('Component library provider (default: radix)'),
  ruleset: z
    .enum(['base-ui', 'radix-legacy', 'both'])
    .optional()
    .default('base-ui')
    .describe('Ruleset selection for evidence evaluation'),
  evidence: z
    .enum(['summary', 'verbose'])
    .optional()
    .default('summary')
    .describe('Evidence verbosity in output'),
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

  if (resolved.endsWith('.d.ts') || !/\.(ts|tsx)$/.test(resolved)) {
    throw new Error('filePath must point to a .ts or .tsx file');
  }

  return { absolute: resolved, relative };
}

function resolveTsconfig(cwd: string): string | undefined {
  const candidate = path.join(cwd, 'tsconfig.json');
  return fs.existsSync(candidate) ? candidate : undefined;
}

function applyEvidenceVerbosity(
  analysis: AnalysisResult['analysis'],
  evidence: 'summary' | 'verbose'
): AnalysisResult['analysis'] {
  if (!analysis.ir || evidence === 'verbose') {
    return analysis;
  }

  const trimmedEvidence = analysis.ir.evidence.map(({ id, source, strength, weight }) => ({
    id,
    source,
    strength,
    weight,
  }));

  return {
    ...analysis,
    ir: {
      ...analysis.ir,
      evidence: trimmedEvidence,
    },
  };
}

function selectRules(
  rules: AnalysisResult['rules'],
  ruleset: 'base-ui' | 'radix-legacy' | 'both'
): AnalysisResult['rules'] {
  if (!rules) return undefined;
  if (ruleset === 'base-ui') {
    return { baseUi: rules.baseUi };
  }
  if (ruleset === 'radix-legacy') {
    return { radixLegacy: rules.radixLegacy };
  }
  return rules;
}

/**
 * Handler for the headless_analyze_component tool.
 *
 * @param input - Tool input parameters
 * @returns Analysis result with recommendation and matches
 */
export async function handleAnalyzeComponent(
  input: unknown
): Promise<{ content: { type: 'text'; text: string }[] }> {
  const parsed = analyzeComponentInputSchema.parse(input);
  const { filePath, radixVersion, threshold } = parsed;
  const provider = getProvider(parsed.provider);
  const { absolute, relative } = resolveAndValidatePath(filePath);

  if (provider.name !== 'radix') {
    throw new Error(`Provider "${provider.name}" is not supported for analysis yet`);
  }

  // Analyze the component
  const cwd = process.cwd();
  const moduleGraph = createModuleGraph({
    tsconfigPath: resolveTsconfig(cwd),
    cwd,
    rootDir: cwd,
  });
  const analysis = await analyzeComponent(absolute, { moduleGraph });
  const rules =
    analysis.ir
      ? {
          baseUi: evaluateRuleset(analysis.ir, baseUiRuleset),
          radixLegacy: evaluateRuleset(analysis.ir, radixLegacyRuleset),
        }
      : undefined;
  const analysisForOutput = applyEvidenceVerbosity(analysis, parsed.evidence);
  const rulesForOutput = selectRules(rules, parsed.ruleset);

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
            action: 'NO_LEGACY_RADIX_MATCH',
            reason:
              'No legacy Radix signatures cached. Run headless_extract_primitive to enable migration detection.',
          },
          matches: [],
          analysis: analysisForOutput,
          isAmbiguous: false,
          rules: rulesForOutput,
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

  // If no signatures found, return early with NO_LEGACY_RADIX_MATCH
  if (signatures.length === 0) {
    const result: AnalysisResult = {
      component: analysis.name,
      filePath: relative,
      recommendation: {
        primitive: null,
        package: null,
        confidence: 0,
        action: 'NO_LEGACY_RADIX_MATCH',
        reason: 'No legacy Radix signatures available for comparison',
      },
      matches: [],
      analysis: analysisForOutput,
      isAmbiguous: false,
      rules: rulesForOutput,
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
      action: 'NO_LEGACY_RADIX_MATCH',
      reason: bestMatch
        ? `Low confidence (${bestMatch.confidence}) - likely custom or already Base UI`
        : 'No legacy Radix match detected',
    };
  } else if (bestMatch.confidence >= 70) {
    recommendation = {
      primitive: bestMatch.primitive,
      package: bestMatch.package,
      confidence: bestMatch.confidence,
      action: 'LEGACY_RADIX_MATCH_STRONG',
      reason: `High confidence legacy Radix match (${bestMatch.confidence}) - prioritize Base UI migration`,
    };
  } else {
    recommendation = {
      primitive: bestMatch.primitive,
      package: bestMatch.package,
      confidence: bestMatch.confidence,
      action: 'LEGACY_RADIX_MATCH_POSSIBLE',
      reason: `Moderate confidence legacy Radix match (${bestMatch.confidence}) - review for Base UI migration`,
    };
  }

  const result: AnalysisResult = {
    component: analysis.name,
    filePath: relative,
    recommendation,
    matches: filteredMatches,
    analysis: analysisForOutput,
    isAmbiguous: ambiguous,
    rules: rulesForOutput,
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
  name: 'headless_analyze_component',
  description:
    'Analyze a React component file for legacy Radix signature matches to inform Base UI migration.',
  inputSchema: analyzeComponentInputSchema,
  handler: handleAnalyzeComponent,
};
