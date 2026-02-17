/**
 * Streaming file scanner for constant-memory directory traversal.
 * Uses opendir() to yield one file at a time without buffering the entire tree.
 */

import { opendirSync, lstatSync } from 'fs';
import { join, extname } from 'path';
import type { PathConfig, ExclusionsConfig } from './config.js';
import { DEFAULT_MAX_DEPTH, DEFAULT_MAX_FILE_SIZE, DEFAULT_EXCLUSIONS } from './config.js';

/**
 * Progress report during streaming scan.
 */
export interface ScanProgress {
  scanned: number;
  total: number; // estimated from initial readdir
  indexed: number;
  skipped: number;
  errors: number;
  currentPath?: string;
}

/**
 * A single scanned file entry yielded by the streaming scanner.
 */
export interface ScanEntry {
  path: string;
  stat: { size: number; mtime: number };
  indexMode: 'full' | 'presence';
}

/**
 * Check if a filename matches a glob-like file pattern.
 * Supports simple patterns: *.ext, exact matches, and prefix/suffix wildcards.
 */
function matchesFilePattern(filename: string, pattern: string): boolean {
  if (pattern === filename) return true;
  if (pattern.startsWith('*.')) {
    return filename.endsWith(pattern.slice(1));
  }
  if (pattern.endsWith('*')) {
    return filename.startsWith(pattern.slice(0, -1));
  }
  return false;
}

/**
 * Check if a directory name should be excluded.
 */
function isExcludedDir(
  dirName: string,
  globalExclusions: Required<ExclusionsConfig>,
  pathExclusions?: PathConfig['exclusions']
): boolean {
  if (globalExclusions.directories.includes(dirName)) return true;
  if (pathExclusions?.directories?.includes(dirName)) return true;
  return false;
}

/**
 * Check if a file should be excluded by file patterns or binary extensions.
 */
function isExcludedFile(
  filename: string,
  globalExclusions: Required<ExclusionsConfig>,
  pathExclusions?: PathConfig['exclusions']
): boolean {
  // Check global file patterns
  for (const pattern of globalExclusions.filePatterns) {
    if (matchesFilePattern(filename, pattern)) return true;
  }
  // Check per-path file patterns
  if (pathExclusions?.filePatterns) {
    for (const pattern of pathExclusions.filePatterns) {
      if (matchesFilePattern(filename, pattern)) return true;
    }
  }
  // Check binary extensions
  const ext = extname(filename).toLowerCase();
  if (ext && globalExclusions.binaryExtensions.includes(ext)) return true;
  return false;
}

/**
 * Check if a file matches allowed extensions for a path config.
 */
function matchesExtensions(filename: string, extensions: string[]): boolean {
  if (extensions.length === 0) return true;
  return extensions.some((ext) => filename.endsWith(ext));
}

/**
 * Recursively scan a directory tree using opendirSync()/readSync() for memory efficiency.
 * Yields one file at a time. Uses an async generator so callers can `for await` and
 * interleave indexing work (e.g. DB writes) between entries without blocking the event loop.
 */
async function* scanDir(
  dir: string,
  baseDir: string,
  pathConfig: PathConfig,
  globalExclusions: Required<ExclusionsConfig>,
  extensions: string[],
  maxDepth: number,
  maxFileSize: number,
  currentDepth: number
): AsyncGenerator<ScanEntry | { error: string; path: string }> {
  if (currentDepth > maxDepth) return;

  let dirHandle;
  try {
    dirHandle = opendirSync(dir);
  } catch {
    yield { error: `Cannot open directory: ${dir}`, path: dir };
    return;
  }

  try {
    let entry = dirHandle.readSync();
    while (entry !== null) {
      const fullPath = join(dir, entry.name);

      // Skip symlinks
      try {
        const lstats = lstatSync(fullPath);
        if (lstats.isSymbolicLink()) {
          entry = dirHandle.readSync();
          continue;
        }

        if (entry.isDirectory()) {
          if (!isExcludedDir(entry.name, globalExclusions, pathConfig.exclusions)) {
            yield* scanDir(
              fullPath,
              baseDir,
              pathConfig,
              globalExclusions,
              extensions,
              maxDepth,
              maxFileSize,
              currentDepth + 1
            );
          }
        } else if (entry.isFile()) {
          // Check exclusions
          if (isExcludedFile(entry.name, globalExclusions, pathConfig.exclusions)) {
            entry = dirHandle.readSync();
            continue;
          }

          // Check extension
          if (!matchesExtensions(entry.name, extensions)) {
            entry = dirHandle.readSync();
            continue;
          }

          // Check file size
          const effectiveMaxSize = pathConfig.exclusions?.maxFileSize ?? maxFileSize;
          if (lstats.size > effectiveMaxSize) {
            entry = dirHandle.readSync();
            continue;
          }

          yield {
            path: fullPath,
            stat: { size: lstats.size, mtime: lstats.mtimeMs },
            indexMode: pathConfig.indexMode ?? 'full',
          };
        }
      } catch {
        yield { error: `Cannot stat: ${fullPath}`, path: fullPath };
      }

      entry = dirHandle.readSync();
    }
  } finally {
    dirHandle.closeSync();
  }
}

/**
 * AsyncGenerator-based streaming scanner for multi-path configurations.
 * Scans paths in priority order, yielding one file at a time for constant memory usage.
 *
 * @param paths - Array of PathConfig entries to scan
 * @param exclusions - Global exclusions config
 * @param globalExtensions - Default file extensions when path doesn't override
 * @param globalMaxDepth - Default max depth when path doesn't override
 * @param globalMaxFileSize - Default max file size when path doesn't override
 * @param onProgress - Optional callback for progress reporting
 */
export async function* streamingScan(
  paths: PathConfig[],
  exclusions: ExclusionsConfig,
  globalExtensions: string[] = ['.md'],
  globalMaxDepth: number = DEFAULT_MAX_DEPTH,
  globalMaxFileSize: number = DEFAULT_MAX_FILE_SIZE,
  onProgress?: (progress: ScanProgress) => void
): AsyncGenerator<ScanEntry> {
  // Merge exclusions with defaults
  const mergedExclusions: Required<ExclusionsConfig> = {
    directories: exclusions.directories ?? DEFAULT_EXCLUSIONS.directories,
    filePatterns: exclusions.filePatterns ?? DEFAULT_EXCLUSIONS.filePatterns,
    binaryExtensions: exclusions.binaryExtensions ?? DEFAULT_EXCLUSIONS.binaryExtensions,
    maxFileSize: exclusions.maxFileSize ?? DEFAULT_EXCLUSIONS.maxFileSize,
  };

  // Sort by priority descending (higher first)
  const sortedPaths = [...paths].sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50));

  const progress: ScanProgress = {
    scanned: 0,
    total: 0, // estimated
    indexed: 0,
    skipped: 0,
    errors: 0,
  };

  const seenFiles = new Set<string>();

  for (const pathConfig of sortedPaths) {
    const extensions = pathConfig.fileExtensions ?? globalExtensions;
    const maxDepth = pathConfig.maxDepth ?? globalMaxDepth;
    const maxFileSize = pathConfig.exclusions?.maxFileSize ?? globalMaxFileSize;

    for await (const item of scanDir(
      pathConfig.path,
      pathConfig.path,
      pathConfig,
      mergedExclusions,
      extensions,
      maxDepth,
      maxFileSize,
      0
    )) {
      if ('error' in item) {
        progress.errors++;
        progress.scanned++;
        if (onProgress) onProgress({ ...progress });
        continue;
      }

      progress.scanned++;

      // Deduplicate across overlapping paths
      if (seenFiles.has(item.path)) {
        progress.skipped++;
        if (onProgress) onProgress({ ...progress });
        continue;
      }
      seenFiles.add(item.path);

      progress.indexed++;
      progress.currentPath = item.path;
      if (onProgress) onProgress({ ...progress });

      yield item;
    }
  }
}
