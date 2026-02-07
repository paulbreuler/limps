/**
 * File descriptor budget checking utility.
 *
 * Estimates the number of filesystem entries the watcher will track and
 * warns if the OS soft limit is too low.
 *
 * With @parcel/watcher + FSEvents (macOS), only ~1 FD per watched
 * directory tree is needed.  On Linux (inotify) and other platforms the
 * per-entry cost is higher, so this budget check remains valuable there.
 */

import { readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

export interface FdBudgetResult {
  /** OS soft limit for open files */
  limit: number;
  /** Estimated number of watch entries (files + directories) */
  estimated: number;
  /** Whether estimated entries are within 70% of the FD limit */
  safe: boolean;
}

/** Fraction of FD limit that triggers a warning */
const FD_SAFETY_THRESHOLD = 0.7;

/**
 * Get the OS soft limit for open file descriptors.
 *
 * Tries `process.getrlimit('nofile')` (Node 21.7+) first, then falls
 * back to parsing `ulimit -n`.
 */
export function getFdLimit(): number {
  // Node 21.7+ exposes getrlimit
  const getrlimit = (process as unknown as Record<string, unknown>).getrlimit as
    | ((resource: string) => { soft: number; hard: number })
    | undefined;

  if (typeof getrlimit === 'function') {
    try {
      const { soft } = getrlimit('nofile');
      if (soft > 0) return soft;
    } catch {
      // fall through to ulimit
    }
  }

  try {
    const output = execSync('ulimit -n', { encoding: 'utf-8', timeout: 3000 }).trim();
    const parsed = parseInt(output, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  } catch {
    // unable to determine — return a conservative default
  }

  // Conservative fallback (macOS default is 256, Linux is typically 1024)
  return 256;
}

/**
 * Count files and directories under `rootPaths`, respecting ignore patterns
 * and a depth limit.  The count is a rough estimate of watched entries,
 * primarily relevant on Linux/inotify where each watched directory costs
 * one FD.
 */
export function estimateWatchEntries(
  rootPaths: string[],
  maxDepth: number,
  ignorePatterns: string[]
): number {
  let count = 0;

  const shouldIgnore = (name: string): boolean =>
    ignorePatterns.some((p) => name === p || name.startsWith(p + '/'));

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    count++; // the directory itself

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // permission error or similar — skip
    }

    for (const entry of entries) {
      if (shouldIgnore(entry)) continue;
      // Skip dotfiles/dotdirs
      if (entry.startsWith('.')) continue;

      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath, depth + 1);
        } else {
          count++;
        }
      } catch {
        // stat failed — skip
      }
    }
  };

  for (const rootPath of rootPaths) {
    walk(rootPath, 0);
  }

  return count;
}

/**
 * Check whether the OS has enough file descriptor headroom for the
 * estimated number of watch entries.
 *
 * Returns `{ safe: false }` when estimated entries exceed 70% of the
 * FD soft limit.
 */
export function checkFdBudget(
  watchPaths: string[],
  maxDepth: number,
  ignorePatterns: string[]
): FdBudgetResult {
  const limit = getFdLimit();
  const estimated = estimateWatchEntries(watchPaths, maxDepth, ignorePatterns);
  const safe = estimated < limit * FD_SAFETY_THRESHOLD;

  return { limit, estimated, safe };
}
