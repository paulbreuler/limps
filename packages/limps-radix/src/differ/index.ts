/**
 * Contract differ module for detecting changes between Radix versions.
 */

import type { ExtractedPrimitive } from '../types/index.js';
import type { RadixChange, RadixDiff, DiffSummary } from './types.js';
import { diffContracts } from './props.js';
import { sortBySeverity } from './severity.js';
import {
  resolvePackage,
  fetchTypesWithFallback,
} from '../fetcher/index.js';
import { extractPrimitive } from '../extractor/index.js';
import { getFromCache, saveToCache } from '../cache/index.js';
import { listPrimitives } from '../fetcher/npm-registry.js';

// Re-export types and utilities
export * from './types.js';
export { diffContracts, diffProps, diffSubComponents } from './props.js';
export { getSeverity, isBreaking, sortBySeverity } from './severity.js';
export { generateHint, generateDescription } from './hints.js';
export { parseUnionMembers, isNarrowing, isWidening } from './props.js';

/**
 * Convert primitive name to PascalCase.
 */
function toPascalCase(name: string): string {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Calculate summary counts from changes.
 */
function calculateSummary(changes: RadixChange[]): DiffSummary {
  return {
    totalChanges: changes.length,
    breaking: changes.filter((c) => c.severity === 'breaking').length,
    warnings: changes.filter((c) => c.severity === 'warning').length,
    info: changes.filter((c) => c.severity === 'info').length,
  };
}

/**
 * Fetch or load extracted primitive data for a given version.
 */
async function getExtractedPrimitive(
  primitiveSlug: string,
  version: string
): Promise<ExtractedPrimitive> {
  const primitiveName = toPascalCase(primitiveSlug);

  // Try cache first
  const cached = await getFromCache(primitiveName, version, {
    ignoreExpired: true, // For diffing, we want any cached version
  });
  if (cached) {
    return cached;
  }

  // Fetch and extract
  const resolved = await resolvePackage(primitiveSlug, version);
  const content = await fetchTypesWithFallback(primitiveSlug, version);
  const extracted = extractPrimitive(
    content.content,
    primitiveName,
    resolved.version,
    content.resolved.packageName
  );

  // Save to cache
  await saveToCache(primitiveName, resolved.version, extracted);

  return extracted;
}

/**
 * Diff a single primitive between two versions.
 */
export async function diffPrimitive(
  primitiveSlug: string,
  fromVersion: string,
  toVersion: string
): Promise<RadixChange[]> {
  const [before, after] = await Promise.all([
    getExtractedPrimitive(primitiveSlug, fromVersion),
    getExtractedPrimitive(primitiveSlug, toVersion),
  ]);

  return diffContracts(before, after);
}

/**
 * Diff all primitives (or a subset) between two Radix versions.
 *
 * @param fromVersion - Starting version
 * @param toVersion - Ending version (default: 'latest')
 * @param primitives - Optional list of primitives to diff (default: all)
 * @returns RadixDiff with all changes and summary
 */
export async function diffVersions(
  fromVersion: string,
  toVersion: string = 'latest',
  primitives?: string[]
): Promise<RadixDiff> {
  // Get list of primitives to diff
  let primitivesToDiff: string[];
  if (primitives && primitives.length > 0) {
    primitivesToDiff = primitives.map((p) => p.toLowerCase());
  } else {
    const allPrimitives = await listPrimitives();
    primitivesToDiff = allPrimitives.map((p) => p.name);
  }

  // Resolve actual versions
  const resolvedFrom = await resolvePackage(primitivesToDiff[0], fromVersion);
  const resolvedTo = await resolvePackage(primitivesToDiff[0], toVersion);

  // Diff each primitive
  const allChanges: RadixChange[] = [];

  for (const primitiveSlug of primitivesToDiff) {
    try {
      const changes = await diffPrimitive(
        primitiveSlug,
        resolvedFrom.version,
        resolvedTo.version
      );
      allChanges.push(...changes);
    } catch (error) {
      // Skip primitives that fail (might not exist in one version)
      console.warn(
        `Failed to diff ${primitiveSlug}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Sort and calculate summary
  const sortedChanges = sortBySeverity(allChanges);
  const summary = calculateSummary(sortedChanges);

  return {
    fromVersion: resolvedFrom.version,
    toVersion: resolvedTo.version,
    hasBreakingChanges: summary.breaking > 0,
    summary,
    changes: sortedChanges,
  };
}
