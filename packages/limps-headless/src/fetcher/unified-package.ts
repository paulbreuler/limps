/**
 * Unified Radix UI package support.
 */

import {
  isVersionAtLeast,
  primitiveToPackage,
  queryUnifiedPackage,
  resolvePackageVersion,
} from './npm-registry.js';
import { fetchFromUnifiedPackage, fetchTypes } from './unpkg.js';

export type PackageSource = 'individual' | 'unified';

export interface ResolvedPackage {
  source: PackageSource;
  packageName: string;
  primitive: string;
  version: string;
  typesPath: string;
}

const UNIFIED_PACKAGE_NAME = 'radix-ui';
const UNIFIED_MIN_VERSION = '1.4.3';
const SOURCE_CACHE_TTL_MS = 60 * 60 * 1000;

const unifiedTypesPathOverrides: Record<string, string> = {};

let unifiedAvailabilityCache:
  | { available: boolean; version?: string; timestamp: number }
  | null = null;

function normalizePrimitive(primitive: string): string {
  return primitive.toLowerCase().replace(/\s+/g, '-');
}

function getUnifiedTypesPath(primitive: string): string {
  const normalized = normalizePrimitive(primitive);
  return (
    unifiedTypesPathOverrides[normalized] ??
    `dist/${normalized}.d.ts`
  );
}

async function getUnifiedAvailability(): Promise<{
  available: boolean;
  version?: string;
}> {
  if (
    unifiedAvailabilityCache &&
    Date.now() - unifiedAvailabilityCache.timestamp < SOURCE_CACHE_TTL_MS
  ) {
    return {
      available: unifiedAvailabilityCache.available,
      version: unifiedAvailabilityCache.version,
    };
  }

  const result = await queryUnifiedPackage(UNIFIED_MIN_VERSION);
  unifiedAvailabilityCache = {
    available: result.available,
    version: result.version,
    timestamp: Date.now(),
  };

  return result;
}

/**
 * Detect if the unified package is available.
 */
export async function detectPackageSource(
  _primitive: string
): Promise<PackageSource> {
  const unified = await getUnifiedAvailability();
  return unified.available ? 'unified' : 'individual';
}

/**
 * Resolve package metadata for a primitive and version hint.
 */
export async function resolvePackage(
  primitive: string,
  versionHint: string
): Promise<ResolvedPackage> {
  const normalized = normalizePrimitive(primitive);
  const unified = await getUnifiedAvailability();

  if (unified.available) {
    const unifiedVersion = await resolvePackageVersion(
      UNIFIED_PACKAGE_NAME,
      versionHint
    );

    if (isVersionAtLeast(unifiedVersion, UNIFIED_MIN_VERSION)) {
      return {
        source: 'unified',
        packageName: UNIFIED_PACKAGE_NAME,
        primitive: normalized,
        version: unifiedVersion,
        typesPath: getUnifiedTypesPath(normalized),
      };
    }
  }

  const individualPackage = primitiveToPackage(normalized);
  const individualVersion = await resolvePackageVersion(
    individualPackage,
    versionHint
  );

  return {
    source: 'individual',
    packageName: individualPackage,
    primitive: normalized,
    version: individualVersion,
    typesPath: 'dist/index.d.ts',
  };
}

/**
 * Fetch type definitions with unified-package fallback handling.
 */
export async function fetchTypesWithFallback(
  primitive: string,
  versionHint: string
): Promise<{ resolved: ResolvedPackage; content: string }> {
  const normalized = normalizePrimitive(primitive);
  let resolved = await resolvePackage(normalized, versionHint);

  try {
    const content =
      resolved.source === 'unified'
        ? await fetchFromUnifiedPackage(
            resolved.primitive,
            resolved.version,
            resolved.typesPath
          )
        : await fetchTypes(resolved.primitive, resolved.version);

    return { resolved, content };
  } catch (error) {
    if (resolved.source !== 'unified') {
      throw error;
    }

    const fallbackPackage = primitiveToPackage(normalized);
    const fallbackVersion = await resolvePackageVersion(
      fallbackPackage,
      versionHint
    );
    const content = await fetchTypes(normalized, fallbackVersion);

    resolved = {
      source: 'individual',
      packageName: fallbackPackage,
      primitive: normalized,
      version: fallbackVersion,
      typesPath: 'dist/index.d.ts',
    };

    return { resolved, content };
  }
}
