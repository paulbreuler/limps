/**
 * Filesystem safety utilities for preventing symlink traversal and oversized file ingestion.
 *
 * Uses `lstatSync` (which does NOT follow symlinks) to inspect entries before
 * any content is read, closing the data-leak vector where a symlink pointing
 * at `/etc/passwd` (or similar) would be indexed into FTS5.
 */

import { lstatSync, realpathSync } from 'fs';
import { dirname, relative, isAbsolute } from 'path';

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

/**
 * Check if a path or any of its ancestor directories are symlinks.
 *
 * This prevents traversal attacks via symlinked parent directories
 * (e.g., `plans/linked/secret.md` where `plans/linked` is a symlink).
 *
 * @param fullPath - Absolute path to check
 * @param root - Root directory to stop checking at
 * @returns PathSafetyResult indicating if any ancestor is a symlink
 */
export function checkSymlinkAncestors(fullPath: string, root: string): PathSafetyResult {
  try {
    // Normalize both paths to absolute
    if (!isAbsolute(fullPath) || !isAbsolute(root)) {
      return { safe: false, reason: 'paths must be absolute' };
    }

    // Check that fullPath is actually under root
    const rel = relative(root, fullPath);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return { safe: false, reason: 'path is outside root' };
    }

    // Walk up from fullPath to root, checking each component
    let current = fullPath;
    while (current !== root && current.length >= root.length) {
      if (isSymlink(current)) {
        return {
          safe: false,
          reason: `ancestor directory is a symlink: ${current}`,
        };
      }
      const parent = dirname(current);
      // Prevent infinite loop if dirname returns same path
      if (parent === current) break;
      current = parent;
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: 'cannot check ancestor symlinks' };
  }
}

/**
 * Check if a path's realpath is contained within a root directory.
 *
 * This prevents symlink traversal by verifying the resolved path
 * stays within the intended directory tree.
 *
 * @param fullPath - Absolute path to check
 * @param root - Root directory that should contain the path
 * @returns PathSafetyResult indicating containment
 */
export function checkPathContainment(fullPath: string, root: string): PathSafetyResult {
  try {
    // Resolve both paths to their real locations
    const realPath = realpathSync(fullPath);
    const realRoot = realpathSync(root);

    // Check if realPath is under realRoot
    const rel = relative(realRoot, realPath);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return {
        safe: false,
        reason: `resolved path escapes root: ${realPath} not in ${realRoot}`,
      };
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: 'cannot resolve real paths' };
  }
}
