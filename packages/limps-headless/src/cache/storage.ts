/**
 * File-based cache storage for Radix primitive data.
 *
 * Cache structure:
 * ~/.limps-headless/
 *   cache/
 *     1.0.5/
 *       dialog.json          # ExtractedPrimitive
 *       dialog.sig.json      # BehaviorSignature
 *     1.1.0/
 *       ...
 *     latest-resolved.json   # { primitive: { version: "1.1.2", resolvedAt: "..." } }
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Default cache directory name.
 */
const CACHE_DIR_NAME = '.limps-headless';

/**
 * Sub-directory for versioned cache data.
 */
const CACHE_SUBDIR = 'cache';

/**
 * Get the cache directory path.
 * @param baseDir - Optional base directory (defaults to home directory)
 * @returns Absolute path to the cache directory
 */
export function getCacheDir(baseDir?: string): string {
  const base = baseDir || os.homedir();
  return path.join(base, CACHE_DIR_NAME, CACHE_SUBDIR);
}

/**
 * Get the versioned cache directory path.
 * @param version - The Radix version
 * @param baseDir - Optional base directory
 * @returns Absolute path to the versioned cache directory
 */
export function getVersionedCacheDir(version: string, baseDir?: string): string {
  return path.join(getCacheDir(baseDir), version);
}

/**
 * Get the path for a cached primitive file.
 * @param primitive - Primitive name (e.g., "Dialog")
 * @param version - Version string
 * @param type - Type of cache ('data' for ExtractedPrimitive, 'sig' for BehaviorSignature)
 * @param baseDir - Optional base directory
 * @returns Absolute file path
 */
export function getCachePath(
  primitive: string,
  version: string,
  type: 'data' | 'sig',
  baseDir?: string
): string {
  const dir = getVersionedCacheDir(version, baseDir);
  const fileName =
    type === 'sig' ? `${primitive.toLowerCase()}.sig.json` : `${primitive.toLowerCase()}.json`;
  return path.join(dir, fileName);
}

/**
 * Ensure the cache directory exists.
 * @param dirPath - Directory path to create
 */
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Read data from a cache file.
 * @param cachePath - Full path to the cache file
 * @returns Parsed JSON data or null if file doesn't exist or is invalid
 */
export async function readFromFile<T>(cachePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(cachePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    // File doesn't exist or parse error
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    // Log parse errors but return null
    console.warn(`Cache read error for ${cachePath}:`, error);
    return null;
  }
}

/**
 * Write data to a cache file.
 * @param cachePath - Full path to the cache file
 * @param data - Data to write
 */
export async function writeToFile<T>(cachePath: string, data: T): Promise<void> {
  const dir = path.dirname(cachePath);
  await ensureDir(dir);
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(cachePath, content, 'utf-8');
}

/**
 * Delete a cache file.
 * @param cachePath - Full path to the cache file
 * @returns True if file was deleted, false if it didn't exist
 */
export async function deleteFile(cachePath: string): Promise<boolean> {
  try {
    await fs.unlink(cachePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Delete a directory and all its contents.
 * @param dirPath - Directory path to delete
 * @returns True if directory was deleted, false if it didn't exist
 */
export async function deleteDir(dirPath: string): Promise<boolean> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * List all versioned cache directories.
 * @param baseDir - Optional base directory
 * @returns Array of version strings that have cached data
 */
export async function listCachedVersions(baseDir?: string): Promise<string[]> {
  const cacheDir = getCacheDir(baseDir);
  try {
    const entries = await fs.readdir(cacheDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => /^\d+\.\d+\.\d+/.test(name)); // Only semver-like directories
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * List all cached primitives for a version.
 * @param version - Version string
 * @param baseDir - Optional base directory
 * @returns Array of primitive names that have cached data
 */
export async function listCachedPrimitives(version: string, baseDir?: string): Promise<string[]> {
  const versionDir = getVersionedCacheDir(version, baseDir);
  try {
    const entries = await fs.readdir(versionDir);
    return entries
      .filter((name) => name.endsWith('.json') && !name.endsWith('.sig.json'))
      .map((name) => {
        // Convert filename back to primitive name (capitalize first letter)
        const baseName = name.replace('.json', '');
        return baseName.charAt(0).toUpperCase() + baseName.slice(1);
      });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
