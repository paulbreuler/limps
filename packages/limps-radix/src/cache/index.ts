/**
 * Cache module for Radix primitive data.
 *
 * Provides version-aware caching with TTL for:
 * - ExtractedPrimitive data
 * - BehaviorSignature data
 * - "Latest" version resolution
 */

import type { ExtractedPrimitive, BehaviorSignature } from '../types/index.js';
import {
  getCacheDir,
  getCachePath,
  readFromFile,
  writeToFile,
  deleteFile,
  deleteDir,
  listCachedVersions,
  listCachedPrimitives,
} from './storage.js';
import { isVersionDataExpired, isSignatureExpired, TTL } from './ttl.js';
import * as path from 'node:path';

// Re-export storage and TTL utilities
export * from './storage.js';
export * from './ttl.js';

/**
 * Latest version resolution cache entry.
 */
export interface LatestResolution {
  version: string;
  resolvedAt: string;
}

/**
 * Latest resolution cache file content.
 */
export interface LatestResolutionCache {
  [primitive: string]: LatestResolution;
}

/**
 * Cache options for get operations.
 */
export interface CacheGetOptions {
  /**
   * Skip TTL check and return cached data even if expired.
   */
  ignoreExpired?: boolean;

  /**
   * Base directory for cache (for testing).
   */
  baseDir?: string;
}

/**
 * Cache options for save operations.
 */
export interface CacheSaveOptions {
  /**
   * Base directory for cache (for testing).
   */
  baseDir?: string;
}

/**
 * Get cached ExtractedPrimitive data.
 * @param primitive - Primitive name (e.g., "Dialog")
 * @param version - Version string
 * @param options - Cache options
 * @returns Cached data or null if not found or expired
 */
export async function getFromCache(
  primitive: string,
  version: string,
  options: CacheGetOptions = {}
): Promise<ExtractedPrimitive | null> {
  const cachePath = getCachePath(primitive, version, 'data', options.baseDir);
  const data = await readFromFile<ExtractedPrimitive>(cachePath);

  if (!data) {
    return null;
  }

  // Check expiration unless ignored
  if (!options.ignoreExpired && isVersionDataExpired(data.extractedAt)) {
    return null;
  }

  return data;
}

/**
 * Save ExtractedPrimitive data to cache.
 * @param primitive - Primitive name (e.g., "Dialog")
 * @param version - Version string
 * @param data - Data to cache
 * @param options - Cache options
 */
export async function saveToCache(
  primitive: string,
  version: string,
  data: ExtractedPrimitive,
  options: CacheSaveOptions = {}
): Promise<void> {
  const cachePath = getCachePath(primitive, version, 'data', options.baseDir);
  await writeToFile(cachePath, data);
}

/**
 * Get cached BehaviorSignature data.
 * @param primitive - Primitive name (e.g., "Dialog")
 * @param version - Version string
 * @param options - Cache options
 * @returns Cached signature or null if not found or expired
 */
export async function getSignatureFromCache(
  primitive: string,
  version: string,
  options: CacheGetOptions = {}
): Promise<BehaviorSignature | null> {
  const cachePath = getCachePath(primitive, version, 'sig', options.baseDir);

  // BehaviorSignature doesn't have a timestamp, so we check the ExtractedPrimitive
  const extractedPath = getCachePath(primitive, version, 'data', options.baseDir);
  const extracted = await readFromFile<ExtractedPrimitive>(extractedPath);

  // If no extracted data exists, signature is orphaned
  if (!extracted && !options.ignoreExpired) {
    return null;
  }

  // Check expiration based on extracted data timestamp
  if (extracted && !options.ignoreExpired && isSignatureExpired(extracted.extractedAt)) {
    return null;
  }

  return readFromFile<BehaviorSignature>(cachePath);
}

/**
 * Save BehaviorSignature data to cache.
 * @param primitive - Primitive name (e.g., "Dialog")
 * @param version - Version string
 * @param signature - Signature to cache
 * @param options - Cache options
 */
export async function saveSignatureToCache(
  primitive: string,
  version: string,
  signature: BehaviorSignature,
  options: CacheSaveOptions = {}
): Promise<void> {
  const cachePath = getCachePath(primitive, version, 'sig', options.baseDir);
  await writeToFile(cachePath, signature);
}

/**
 * Get the "latest" version resolution for a primitive.
 * @param primitive - Primitive name
 * @param options - Cache options
 * @returns Latest resolution or null if not found or expired
 */
export async function getLatestResolution(
  primitive: string,
  options: CacheGetOptions = {}
): Promise<LatestResolution | null> {
  const cacheDir = getCacheDir(options.baseDir);
  const latestPath = path.join(cacheDir, 'latest-resolved.json');

  const cache = await readFromFile<LatestResolutionCache>(latestPath);
  if (!cache || !cache[primitive]) {
    return null;
  }

  const resolution = cache[primitive];

  // Check expiration
  if (!options.ignoreExpired) {
    const resolvedTime = new Date(resolution.resolvedAt).getTime();
    const now = Date.now();
    if (now - resolvedTime >= TTL.LATEST_RESOLUTION) {
      return null;
    }
  }

  return resolution;
}

/**
 * Save a "latest" version resolution.
 * @param primitive - Primitive name
 * @param version - Resolved version string
 * @param options - Cache options
 */
export async function saveLatestResolution(
  primitive: string,
  version: string,
  options: CacheSaveOptions = {}
): Promise<void> {
  const cacheDir = getCacheDir(options.baseDir);
  const latestPath = path.join(cacheDir, 'latest-resolved.json');

  // Read existing cache
  let cache = await readFromFile<LatestResolutionCache>(latestPath);
  if (!cache) {
    cache = {};
  }

  // Update entry
  cache[primitive] = {
    version,
    resolvedAt: new Date().toISOString(),
  };

  await writeToFile(latestPath, cache);
}

/**
 * Clear cache for a specific primitive and version, or all cache.
 * @param primitive - Optional primitive name (clears all if not provided)
 * @param version - Optional version (clears all versions of primitive if not provided)
 * @param options - Cache options
 */
export async function clearCache(
  primitive?: string,
  version?: string,
  options: CacheSaveOptions = {}
): Promise<void> {
  const cacheDir = getCacheDir(options.baseDir);

  // Clear everything
  if (!primitive) {
    await deleteDir(cacheDir);
    return;
  }

  // Clear specific primitive in specific version
  if (version) {
    await deleteFile(getCachePath(primitive, version, 'data', options.baseDir));
    await deleteFile(getCachePath(primitive, version, 'sig', options.baseDir));
    return;
  }

  // Clear specific primitive in all versions
  const versions = await listCachedVersions(options.baseDir);
  for (const v of versions) {
    await deleteFile(getCachePath(primitive, v, 'data', options.baseDir));
    await deleteFile(getCachePath(primitive, v, 'sig', options.baseDir));
  }
}

/**
 * Get cache statistics.
 * @param options - Cache options
 * @returns Cache statistics
 */
export async function getCacheStats(options: CacheGetOptions = {}): Promise<{
  versions: string[];
  primitiveCount: number;
  signatureCount: number;
}> {
  const versions = await listCachedVersions(options.baseDir);

  let primitiveCount = 0;
  let signatureCount = 0;

  for (const version of versions) {
    const primitives = await listCachedPrimitives(version, options.baseDir);
    primitiveCount += primitives.length;

    // Count signatures (files ending in .sig.json)
    for (const primitive of primitives) {
      const sigPath = getCachePath(primitive, version, 'sig', options.baseDir);
      const sig = await readFromFile<BehaviorSignature>(sigPath);
      if (sig) {
        signatureCount++;
      }
    }
  }

  return {
    versions,
    primitiveCount,
    signatureCount,
  };
}
