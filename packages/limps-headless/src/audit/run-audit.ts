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
import type { AnalysisResult, BehaviorSignature } from '../types/index.js';
import type { RadixDiff, UpdateCheckResult } from '../differ/types.js';
import type { ComponentMetadata, DiscoveryOptions } from './types.js';
import { discoverComponents } from './discover-components.js';
import { generateReport } from './generate-report.js';
import type { GenerateReportResult } from './generate-report.js';

const REFERENCE_PRIMITIVE = 'dialog';

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

import type { RunAuditOptions } from './types.js';

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
  /** Policy options (backend mode, migration threshold). Used when backend/migration analysis is available. */
  policy?: Partial<RunAuditOptions>;
}

export interface RunAuditResult extends GenerateReportResult {
  analysisPath?: string;
  diffPath?: string;
  updatesPath?: string;
  inventoryPath?: string;
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
  signatures: BehaviorSignature[]
): Promise<AnalysisResult[]> {
  const threshold = 40;
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
      const analysis = await analyzeComponent(absolute);
      let recommendation: AnalysisResult['recommendation'];
      let matches = signatures.length > 0 ? scoreAgainstSignatures(analysis, signatures) : [];
      matches = matches.filter((m) => m.confidence >= threshold);
      const ambiguous = isAmbiguous(matches);
      const bestMatch = matches.length > 0 ? disambiguate(matches, analysis) : null;

      if (!bestMatch || bestMatch.confidence < 50) {
        recommendation = {
          primitive: null,
          package: null,
          confidence: bestMatch?.confidence ?? 0,
          action: 'CUSTOM_OK',
          reason:
            bestMatch?.confidence
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
        matches,
        analysis,
        isAmbiguous: ambiguous,
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
  let files = input.scope?.files ?? [];
  let discovered: ComponentMetadata[] = [];
  if (files.length === 0) {
    discovered = await discoverComponents(input.discovery);
    inventoryPath = persistInventory(outputDir, discovered);
    files = discovered.map((c) => c.path);
  }

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
    const results = await analyzeFiles(files, signatures);

    const serializable = results.map((r) => ({
      ...r,
      analysis: serializeAnalysis(r.analysis),
    }));
    analysisPath = path.join(outputDir, 'analysis.json');
    fs.writeFileSync(analysisPath, JSON.stringify({ results: serializable }, null, 2), 'utf-8');
  } else {
    analysisPath = path.join(outputDir, 'analysis.json');
    fs.writeFileSync(analysisPath, JSON.stringify({ results: [] }, null, 2), 'utf-8');
  }

  const currentResolution = await getLatestResolution(REFERENCE_PRIMITIVE);
  const currentVersion = currentResolution?.version;
  const packageName = `@radix-ui/react-${REFERENCE_PRIMITIVE}`;
  const latestVersion = await resolvePackageVersion(packageName, 'latest');
  const fromVersion = currentVersion ?? input.radixVersion ?? latestVersion;
  const diff: RadixDiff = await diffVersions(fromVersion, latestVersion, primitives);
  const diffPath = path.join(outputDir, 'diff.json');
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
  const updatesPath = path.join(outputDir, 'updates.json');
  fs.writeFileSync(updatesPath, JSON.stringify(updates, null, 2), 'utf-8');

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
  });

  return {
    ...gen,
    analysisPath,
    diffPath,
    updatesPath,
    inventoryPath,
  };
}
