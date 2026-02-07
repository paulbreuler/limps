/**
 * Filesystem safety utilities for preventing symlink traversal and oversized file ingestion.
 *
 * Uses `lstatSync` (which does NOT follow symlinks) to inspect entries before
 * any content is read, closing the data-leak vector where a symlink pointing
 * at `/etc/passwd` (or similar) would be indexed into FTS5.
 */

import { lstatSync } from 'fs';

/**
 * Result of a path safety check.
 */
export interface PathSafetyResult {
  safe: boolean;
  reason?: string;
}

/**
 * Options for `checkPathSafety`.
 */
export interface PathSafetyOptions {
  /** Maximum allowed file size in bytes. Files larger than this are rejected. */
  maxFileSize?: number;
}

/**
 * Check whether a filesystem path is safe to read.
 *
 * - Rejects symbolic links (prevents data leaks from outside the plans tree).
 * - Rejects files exceeding `maxFileSize` (prevents OOM from multi-MB files).
 *
 * Uses `lstatSync` so the check never follows symlinks.
 *
 * @param fullPath - Absolute path to check
 * @param options - Safety options (maxFileSize)
 * @returns Safety result with reason if unsafe
 */
export function checkPathSafety(
  fullPath: string,
  options: PathSafetyOptions = {}
): PathSafetyResult {
  try {
    const stats = lstatSync(fullPath);

    if (stats.isSymbolicLink()) {
      return { safe: false, reason: 'symbolic link' };
    }

    if (options.maxFileSize !== undefined && stats.size > options.maxFileSize) {
      return {
        safe: false,
        reason: `file size ${stats.size} exceeds limit ${options.maxFileSize}`,
      };
    }

    return { safe: true };
  } catch {
    // If we can't stat the file, it's not safe to read
    return { safe: false, reason: 'cannot stat file' };
  }
}

/**
 * Check whether a path is a symbolic link.
 *
 * Convenience wrapper around `lstatSync().isSymbolicLink()`.
 * Returns `false` if the path does not exist or cannot be stat'd.
 */
export function isSymlink(fullPath: string): boolean {
  try {
    return lstatSync(fullPath).isSymbolicLink();
  } catch {
    return false;
  }
}
