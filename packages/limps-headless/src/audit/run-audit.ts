/**
 * Orchestrate analysis, diff, update-check and report generation.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { rcompare, valid as validSemver } from 'semver';
import { analyzeComponent, scoreAgainstSignatures, disambiguate, isAmbiguous } from '../analyzer/index.js';
import { getSignatureFromCache, getLatestResolution, listCachedPrimitives, listCachedVersions } from '../cache/index.js';
import { diffVersions } from '../differ/index.js';
import { resolvePackageVersion } from '../fetcher/npm-registry.js';
import { createModuleGraph } from '../analysis/module-graph.js';
import type { AnalysisResult, BehaviorSignature } from '../types/index.js';
import type { RadixDiff, UpdateCheckResult } from '../differ/types.js';
import type { ComponentMetadata, DiscoveryOptions, RunAuditOptions } from './types.js';
import { discoverComponents } from './discover-components.js';
import { generateReport } from './generate-report.js';
import type { GenerateReportResult } from './generate-report.js';
import { baseUiRuleset, evaluateRuleset, radixLegacyRuleset } from '../rules/index.js';

/** Reference primitive for version resolution (Radix: dialog). */
const REFERENCE_PRIMITIVE = 'dialog';

/** Minimum confidence to include a match in analysis results. */
const DEFAULT_ANALYSIS_THRESHOLD = 40;
/** Max confidence for NO_LEGACY_RADIX_MATCH (below this = custom/Base). */
const CONFIDENCE_CUSTOM_OK_MAX = 50;
/** Min confidence for LEGACY_RADIX_MATCH_STRONG (above this = strong match). */
const CONFIDENCE_ADOPT_MIN = 70;

function serializeAnalysis(analysis: AnalysisResult['analysis']) {
  return {
    ...analysis,
    propsInterface: Object.fromEntries(analysis.propsInterface.entries()),
  };
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function resolveTsconfig(cwd: string): string | undefined {
  const candidate = path.join(cwd, 'tsconfig.json');
  return fs.existsSync(candidate) ? candidate : undefined;
}

export interface RunAuditInput {
  scope?: {
    files?: string[];
    primitives?: string[];
    provider?: string;
  };
  discovery?: DiscoveryOptions;
  radixVersion?: string;
  outputDir?: string;
  format?: 'json' | 'markdown' | 'both';
  ruleset?: 'base-ui' | 'radix-legacy' | 'both';
  evidence?: 'summary' | 'verbose';
  debugIr?: boolean;
  /** Policy options (backend mode, migration threshold). Used when backend/migration analysis is available. */
  policy?: Partial<RunAuditOptions>;
}

export interface RunAuditResult extends GenerateReportResult {
  analysisPath?: string;
  diffPath?: string;
  updatesPath?: string;
  inventoryPath?: string;
  irPath?: string;
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

async function loadSignatures(version: string): Promise<BehaviorSignature[]> {
  const signatures: BehaviorSignature[] = [];
  const primitivesList = await listCachedPrimitives(version);
  for (const p of primitivesList) {
    const sig = await getSignatureFromCache(p, version);
    if (sig) signatures.push(sig);
  }
  return signatures;
}

async function analyzeFiles(
  files: string[],
  signatures: BehaviorSignature[],
  options: { ruleset: 'base-ui' | 'radix-legacy' | 'both'; evidence: 'summary' | 'verbose' },
  moduleGraph = createModuleGraph({
    tsconfigPath: resolveTsconfig(process.cwd()),
    cwd: process.cwd(),
    rootDir: process.cwd(),
  })
): Promise<AnalysisResult[]> {
  const threshold = DEFAULT_ANALYSIS_THRESHOLD;
  const results: AnalysisResult[] = [];
  const cwd = process.cwd();

  for (const file of files) {
    const absolute = path.resolve(file);
    const relative = path.relative(cwd, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      continue;
    }
    if (absolute.endsWith('.d.ts') || !/\.(ts|tsx)$/.test(absolute)) {
      continue;
    }
    try {
      const analysis = await analyzeComponent(absolute, { moduleGraph });
      const rules =
        analysis.ir
          ? {
              baseUi: evaluateRuleset(analysis.ir, baseUiRuleset),
              radixLegacy: evaluateRuleset(analysis.ir, radixLegacyRuleset),
            }
          : undefined;
      const analysisForOutput = applyEvidenceVerbosity(analysis, options.evidence);
      const rulesForOutput = selectRules(rules, options.ruleset);
      let recommendation: AnalysisResult['recommendation'];
      let matches = signatures.length > 0 ? scoreAgainstSignatures(analysis, signatures) : [];
      matches = matches.filter((m) => m.confidence >= threshold);
      const ambiguous = isAmbiguous(matches);
      const bestMatch = matches.length > 0 ? disambiguate(matches, analysis) : null;

      if (!bestMatch || bestMatch.confidence < CONFIDENCE_CUSTOM_OK_MAX) {
        recommendation = {
          primitive: null,
          package: null,
          confidence: bestMatch?.confidence ?? 0,
          action: 'NO_LEGACY_RADIX_MATCH',
          reason:
            bestMatch?.confidence
              ? `Low confidence (${bestMatch.confidence}) - likely custom or already Base UI`
              : 'No legacy Radix match detected',
        };
      } else if (bestMatch.confidence >= CONFIDENCE_ADOPT_MIN) {
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
        matches,
        analysis: analysisForOutput,
        isAmbiguous: ambiguous,
        rules: rulesForOutput,
      };
      results.push(result);
    } catch (err) {
      console.warn(
        `[run-audit] Skipped ${relative}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return results;
}

function persistInventory(
  outputDir: string,
  components: ComponentMetadata[]
): string {
  const inventoryPath = path.join(outputDir, 'component-inventory.json');
  fs.writeFileSync(inventoryPath, JSON.stringify({ components }, null, 2), 'utf-8');
  return inventoryPath;
}

/**
 * Run full audit: optional analysis on files, diff, update-check, then generate report.
 */
export async function runAudit(input: RunAuditInput): Promise<RunAuditResult> {
  const outputDir = path.resolve(input.outputDir ?? '.limps-headless/reports');
  ensureDir(outputDir);
  const format = input.format ?? 'both';
  const primitives = input.scope?.primitives;
  let inventoryPath: string | undefined;

  let analysisPath: string | undefined;
  let irPath: string | undefined;
  let files = input.scope?.files ?? [];
  let discovered: ComponentMetadata[] = [];
  let legacyRadixCount = 0;
  const didDiscover = files.length === 0;
  if (didDiscover) {
    discovered = await discoverComponents(input.discovery);
    inventoryPath = persistInventory(outputDir, discovered);
    files = discovered.map((c) => c.path);
    legacyRadixCount = discovered.filter(
      (component) => component.backend === 'radix' || component.mixedUsage
    ).length;
  }

  let results: Awaited<ReturnType<typeof analyzeFiles>> = [];
  if (files.length > 0) {
    let resolvedVersion = input.radixVersion ?? 'latest';
    if (resolvedVersion === 'latest') {
      const latestResolution = await getLatestResolution(REFERENCE_PRIMITIVE);
      if (latestResolution) {
        resolvedVersion = latestResolution.version;
      } else {
        const versions = await listCachedVersions();
        if (versions.length > 0) {
          const validVersions = versions.filter((v) => validSemver(v));
          resolvedVersion =
            validVersions.length > 0
              ? validVersions.sort(rcompare)[0]
              : versions.sort().reverse()[0];
        }
      }
    }

    const signatures = await loadSignatures(resolvedVersion);
    results = await analyzeFiles(files, signatures, {
      ruleset: input.ruleset ?? 'base-ui',
      evidence: input.evidence ?? 'summary',
    });
    const serializable = results.map((r) => ({
      ...r,
      analysis: serializeAnalysis(r.analysis),
    }));
    analysisPath = path.join(outputDir, 'analysis.json');
    fs.writeFileSync(analysisPath, JSON.stringify({ results: serializable }, null, 2), 'utf-8');

    if (input.debugIr) {
      irPath = path.join(outputDir, 'ir.json');
      const irDump = results.map((r) => ({
        component: r.component,
        filePath: r.filePath,
        ir: r.analysis.ir ?? null,
      }));
      fs.writeFileSync(irPath, JSON.stringify({ components: irDump }, null, 2), 'utf-8');
    }
  } else {
    analysisPath = path.join(outputDir, 'analysis.json');
    fs.writeFileSync(analysisPath, JSON.stringify({ results: [] }, null, 2), 'utf-8');
  }

  const hasRadixSignals = didDiscover
    ? legacyRadixCount > 0
    : results.some((r) => r.recommendation.action !== 'NO_LEGACY_RADIX_MATCH');
  const shouldSkipRadixDiff = !hasRadixSignals;
  let diffPath: string | undefined;
  let updatesPath: string | undefined;
  if (shouldSkipRadixDiff) {
    const diff: RadixDiff = {
      fromVersion: 'n/a',
      toVersion: 'n/a',
      hasBreakingChanges: false,
      summary: { totalChanges: 0, breaking: 0, warnings: 0, info: 0 },
      changes: [],
    };
    diffPath = path.join(outputDir, 'diff.json');
    fs.writeFileSync(diffPath, JSON.stringify(diff, null, 2), 'utf-8');

    const updates: UpdateCheckResult = {
      currentVersion: 'n/a',
      latestVersion: 'n/a',
      hasUpdate: false,
    };
    updatesPath = path.join(outputDir, 'updates.json');
    fs.writeFileSync(updatesPath, JSON.stringify(updates, null, 2), 'utf-8');
  } else {
    const currentResolution = await getLatestResolution(REFERENCE_PRIMITIVE);
    const currentVersion = currentResolution?.version;
    const packageName = `@radix-ui/react-${REFERENCE_PRIMITIVE}`;
    const latestVersion = await resolvePackageVersion(packageName, 'latest');
    const fromVersion = currentVersion ?? input.radixVersion ?? latestVersion;
    const diff: RadixDiff = await diffVersions(fromVersion, latestVersion, primitives);
    diffPath = path.join(outputDir, 'diff.json');
    fs.writeFileSync(diffPath, JSON.stringify(diff, null, 2), 'utf-8');

    const hasUpdate = currentVersion !== undefined && currentVersion !== latestVersion;
    const updates: UpdateCheckResult = {
      currentVersion: currentVersion ?? latestVersion,
      latestVersion,
      hasUpdate,
    };
    if (hasUpdate) {
      updates.diff = diff;
    }
    updatesPath = path.join(outputDir, 'updates.json');
    fs.writeFileSync(updatesPath, JSON.stringify(updates, null, 2), 'utf-8');
  }

  const gen = generateReport({
    inputs: {
      analysis: analysisPath,
      diff: diffPath,
      checkUpdates: updatesPath,
      inventory: inventoryPath,
    },
    outputDir,
    format,
    title: 'Radix Audit Report',
    policy: input.policy,
  });

  return {
    ...gen,
    analysisPath,
    irPath,
    diffPath,
    updatesPath,
    inventoryPath,
  };
}
