import chokidar, { type FSWatcher } from 'chokidar';
import { PathFilter } from './utils/pathfilter.js';
import { relative } from 'path';

/**
 * Default file extensions to watch.
 */
const DEFAULT_FILE_EXTENSIONS = ['.md'];

export interface SettledChange {
  path: string;
  event: 'add' | 'change' | 'unlink';
}

/**
 * Default delay for settled processing (ms).
 */
export const DEFAULT_SETTLE_DELAY = 1500;

/**
 * Check if a file path matches any of the given extensions.
 */
function matchesExtension(filePath: string, extensions: string[]): boolean {
  return extensions.some((ext) => filePath.endsWith(ext));
}

/**
 * Start a file watcher for specified file types.
 *
 * @param watchPaths - Path(s) to watch (file or directory, single or array)
 * @param onChange - Callback when file changes (path, event)
 * @param fileExtensions - File extensions to watch (e.g., ['.md', '.jsx', '.tsx'])
 * @param ignorePatterns - Patterns to ignore (e.g., ['.git', 'node_modules'])
 * @param debounceDelay - Debounce delay in milliseconds (default: 200ms)
 * @returns Chokidar watcher instance
 */
export function startWatcher(
  watchPaths: string | string[],
  onChange: (path: string, event: 'add' | 'change' | 'unlink') => Promise<void>,
  fileExtensions: string[] = DEFAULT_FILE_EXTENSIONS,
  ignorePatterns: string[] = ['.git', 'node_modules', '.tmp', '.obsidian'],
  debounceDelay = 200,
  settleDelay = DEFAULT_SETTLE_DELAY,
  onSettled?: (changes: SettledChange[]) => Promise<void>
): FSWatcher {
  // Create PathFilter for consistent filtering
  const pathFilter = new PathFilter({
    ignoredPatterns: ignorePatterns.map((pattern) => {
      // Convert simple patterns to glob patterns
      if (pattern.includes('*')) {
        return pattern;
      }
      return `**/${pattern}/**`;
    }),
    allowedExtensions: fileExtensions,
  });

  // Build ignore patterns for Chokidar (for initial filtering)
  const ignored = ignorePatterns.map((pattern) => {
    // Convert simple patterns to glob patterns
    if (pattern.includes('*')) {
      return pattern;
    }
    // Match directories and files with this name
    return `**/${pattern}/**`;
  });

  // Build complete ignore patterns
  const allIgnored: (string | RegExp | ((path: string) => boolean))[] = [
    ...ignored,
    /(^|[/\\])\../, // Ignore dotfiles
  ];

  // Watch the directory (or file if it's a single file)
  const watcher = chokidar.watch(watchPaths, {
    ignored: allIgnored,
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 100,
    },
  });

  // Debounce map to track pending callbacks
  const debounceMap = new Map<string, NodeJS.Timeout>();
  const settledChanges = new Map<string, SettledChange>();
  let settledTimer: NodeJS.Timeout | null = null;

  const debouncedOnChange = (path: string, event: 'add' | 'change' | 'unlink'): void => {
    // Clear existing timeout for this path
    const existing = debounceMap.get(path);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new timeout
    const timeout = setTimeout(async () => {
      debounceMap.delete(path);
      try {
        await onChange(path, event);
      } catch (error) {
        // Log error but don't throw (watcher should continue)
        console.error(`Error in onChange callback for ${path}:`, error);
      }
    }, debounceDelay);

    debounceMap.set(path, timeout);
  };

  const scheduleSettled = (path: string, event: 'add' | 'change' | 'unlink'): void => {
    if (!onSettled) {
      return;
    }

    settledChanges.set(path, { path, event });

    if (settledTimer) {
      clearTimeout(settledTimer);
    }

    settledTimer = setTimeout(async () => {
      const changes = Array.from(settledChanges.values());
      settledChanges.clear();
      settledTimer = null;

      try {
        await onSettled(changes);
      } catch (error) {
        console.error('Error in onSettled callback:', error);
      }
    }, settleDelay);
  };

  // Helper to get relative path for PathFilter
  const getRelativePath = (absolutePath: string): string => {
    // Try to get relative path from first watch path
    const basePath = Array.isArray(watchPaths) ? watchPaths[0] : watchPaths;
    try {
      return relative(basePath, absolutePath);
    } catch {
      // Fallback to just the filename if relative fails
      return absolutePath.split(/[/\\]/).pop() || absolutePath;
    }
  };

  // Watch for file additions (only files with matching extensions and allowed by PathFilter)
  watcher.on('add', (path) => {
    if (matchesExtension(path, fileExtensions)) {
      const relPath = getRelativePath(path);
      if (pathFilter.isAllowed(relPath)) {
        debouncedOnChange(path, 'add');
        scheduleSettled(path, 'add');
      }
    }
  });

  // Watch for file changes (only files with matching extensions and allowed by PathFilter)
  watcher.on('change', (path) => {
    if (matchesExtension(path, fileExtensions)) {
      const relPath = getRelativePath(path);
      if (pathFilter.isAllowed(relPath)) {
        debouncedOnChange(path, 'change');
        scheduleSettled(path, 'change');
      }
    }
  });

  // Watch for file deletions (only files with matching extensions and allowed by PathFilter)
  watcher.on('unlink', (path) => {
    if (matchesExtension(path, fileExtensions)) {
      const relPath = getRelativePath(path);
      if (pathFilter.isAllowed(relPath)) {
        // Clear any pending debounce for this path
        const existing = debounceMap.get(path);
        if (existing) {
          clearTimeout(existing);
          debounceMap.delete(path);
        }
        scheduleSettled(path, 'unlink');
        // Handle deletion immediately (no debounce needed)
        onChange(path, 'unlink').catch((error) => {
          console.error(`Error handling file deletion for ${path}:`, error);
        });
      }
    }
  });

  // Handle errors
  watcher.on('error', (error) => {
    console.error('Watcher error:', error);
  });

  return watcher;
}

/**
 * Stop a file watcher.
 *
 * @param watcher - Chokidar watcher instance
 */
export async function stopWatcher(watcher: FSWatcher): Promise<void> {
  await watcher.close();
}
