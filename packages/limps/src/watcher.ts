import { PathFilter } from './utils/pathfilter.js';
import { relative, sep } from 'path';
import { isSymlink, checkSymlinkAncestors } from './utils/fs-safety.js';
import { DEFAULT_MAX_DEPTH } from './config.js';
import {
  ParcelWatcherBackend,
  type WatcherBackend,
  type WatcherSubscription,
  type RawWatchEvent,
} from './watcher-backend.js';

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
 * Opaque watcher handle returned by startWatcher().
 * Consumers cannot access backend-specific methods.
 */
export interface LimpsWatcher {
  readonly __brand: 'LimpsWatcher';
}

/**
 * Internal representation behind the opaque LimpsWatcher handle.
 */
interface LimpsWatcherInternal extends LimpsWatcher {
  subscriptions: WatcherSubscription[];
  backend: WatcherBackend;
  debounceMap: Map<string, NodeJS.Timeout>;
  settledChanges: Map<string, SettledChange>;
  settledTimer: NodeJS.Timeout | null;
  closed: boolean;
}

/**
 * Map an event type from the watcher backend's type names to our
 * public type names.
 */
type WatcherEventType = 'add' | 'change' | 'unlink';

function mapEventType(raw: RawWatchEvent['type']): WatcherEventType {
  switch (raw) {
    case 'create':
      return 'add';
    case 'update':
      return 'change';
    case 'delete':
      return 'unlink';
  }
}

/**
 * Check if a file path matches any of the given extensions.
 */
function matchesExtension(filePath: string, extensions: string[]): boolean {
  return extensions.some((ext) => filePath.endsWith(ext));
}

/**
 * Check if a path exceeds the maximum depth relative to a base path.
 */
function exceedsDepth(filePath: string, basePath: string, maxDepth: number): boolean {
  const rel = relative(basePath, filePath);
  // Count path segments (depth). A file directly in basePath has depth 0.
  const segments = rel.split(sep).length - 1;
  return segments > maxDepth;
}

/**
 * Start a file watcher for specified file types.
 *
 * @param watchPaths - Path(s) to watch (file or directory, single or array)
 * @param onChange - Callback when file changes (path, event)
 * @param fileExtensions - File extensions to watch (e.g., ['.md', '.jsx', '.tsx'])
 * @param ignorePatterns - Patterns to ignore (e.g., ['.git', 'node_modules'])
 * @param debounceDelay - Debounce delay in milliseconds (default: 200ms)
 * @param settleDelay - Settle delay in milliseconds (default: 1500ms)
 * @param onSettled - Callback for settled changes
 * @param maxDepth - Maximum directory recursion depth (default: DEFAULT_MAX_DEPTH)
 * @param backend - Optional WatcherBackend for dependency injection (tests)
 * @returns Promise resolving to a LimpsWatcher handle
 */
export async function startWatcher(
  watchPaths: string | string[],
  onChange: (path: string, event: 'add' | 'change' | 'unlink') => Promise<void>,
  fileExtensions: string[] = DEFAULT_FILE_EXTENSIONS,
  ignorePatterns: string[] = [
    '.git',
    'node_modules',
    '.tmp',
    '.obsidian',
    'dist',
    'build',
    '.cache',
  ],
  debounceDelay = 200,
  settleDelay = DEFAULT_SETTLE_DELAY,
  onSettled?: (changes: SettledChange[]) => Promise<void>,
  maxDepth: number = DEFAULT_MAX_DEPTH,
  backend?: WatcherBackend
): Promise<LimpsWatcher> {
  const resolvedBackend = backend ?? new ParcelWatcherBackend();

  // Create PathFilter for consistent filtering
  const pathFilter = new PathFilter({
    ignoredPatterns: ignorePatterns.map((pattern) => {
      if (pattern.includes('*')) {
        return pattern;
      }
      return `**/${pattern}/**`;
    }),
    allowedExtensions: fileExtensions,
  });

  // Build ignore globs for the backend
  const ignoreGlobs = [
    ...ignorePatterns.map((p) => (p.includes('*') ? p : `**/${p}/**`)),
    '**/.*/**', // dotfiles/dotdirs
  ];

  const backendOptions = {
    ignoreGlobs,
  };

  const internal: LimpsWatcherInternal = {
    __brand: 'LimpsWatcher' as const,
    subscriptions: [],
    backend: resolvedBackend,
    debounceMap: new Map(),
    settledChanges: new Map(),
    settledTimer: null,
    closed: false,
  };

  const paths = Array.isArray(watchPaths) ? watchPaths : [watchPaths];

  // Helper to get relative path for PathFilter
  const getRelativePath = (absolutePath: string): string => {
    const matchedBase =
      paths.find((base) => {
        const prefix = base.endsWith(sep) ? base : base + sep;
        return absolutePath === base || absolutePath.startsWith(prefix);
      }) ?? paths[0];

    try {
      return relative(matchedBase, absolutePath);
    } catch {
      return absolutePath.split(/[/\\]/).pop() || absolutePath;
    }
  };

  const debouncedOnChange = (path: string, event: WatcherEventType): void => {
    if (internal.closed) return;

    const existing = internal.debounceMap.get(path);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(async () => {
      internal.debounceMap.delete(path);
      if (internal.closed) return;
      try {
        await onChange(path, event);
      } catch (error) {
        console.error(`Error in onChange callback for ${path}:`, error);
      }
    }, debounceDelay);

    internal.debounceMap.set(path, timeout);
  };

  const scheduleSettled = (path: string, event: WatcherEventType): void => {
    if (!onSettled || internal.closed) return;

    internal.settledChanges.set(path, { path, event });

    if (internal.settledTimer) {
      clearTimeout(internal.settledTimer);
    }

    internal.settledTimer = setTimeout(async () => {
      const changes = Array.from(internal.settledChanges.values());
      internal.settledChanges.clear();
      internal.settledTimer = null;

      if (internal.closed) return;
      try {
        await onSettled(changes);
      } catch (error) {
        console.error('Error in onSettled callback:', error);
      }
    }, settleDelay);
  };

  const handleEvents = (events: RawWatchEvent[]): void => {
    if (internal.closed) return;

    for (const event of events) {
      const mapped = mapEventType(event.type);
      const filePath = event.path;

      // Depth filtering: skip events beyond maxDepth
      const matchedBase = paths.find((base) => {
        const prefix = base.endsWith(sep) ? base : base + sep;
        return filePath === base || filePath.startsWith(prefix);
      });
      if (matchedBase && exceedsDepth(filePath, matchedBase, maxDepth)) {
        continue;
      }

      // Extension filter
      if (!matchesExtension(filePath, fileExtensions)) {
        continue;
      }

      // Symlink check (skip for delete events — file is already gone)
      // Check both the file itself and all ancestor directories
      if (mapped !== 'unlink') {
        if (isSymlink(filePath)) {
          continue;
        }

        // Check if any ancestor directory is a symlink
        // Find the base path being watched for this file
        const matchedBase = paths.find((base) => {
          const prefix = base.endsWith(sep) ? base : base + sep;
          return filePath === base || filePath.startsWith(prefix);
        });

        if (!matchedBase) {
          // Event path doesn't match any watched directory - skip it
          console.error(
            `Watcher event for unexpected path (not under any watched dir): ${filePath}`
          );
          continue;
        }

        const ancestorCheck = checkSymlinkAncestors(filePath, matchedBase);
        if (!ancestorCheck.safe) {
          continue;
        }
      }

      // PathFilter check
      const relPath = getRelativePath(filePath);
      if (!pathFilter.isAllowed(relPath)) {
        continue;
      }

      if (mapped === 'unlink') {
        // Handle deletion immediately (no debounce needed)
        const existing = internal.debounceMap.get(filePath);
        if (existing) {
          clearTimeout(existing);
          internal.debounceMap.delete(filePath);
        }
        scheduleSettled(filePath, 'unlink');
        onChange(filePath, 'unlink').catch((error) => {
          console.error(`Error handling file deletion for ${filePath}:`, error);
        });
      } else {
        debouncedOnChange(filePath, mapped);
        scheduleSettled(filePath, mapped);
      }
    }
  };

  // Subscribe first (so no events are missed), then do initial scan.
  // Duplicates from the overlap are collapsed by the debounce.
  // If a subscribe fails partway through, clean up already-subscribed dirs.
  for (const dir of paths) {
    let sub;
    try {
      sub = await resolvedBackend.subscribe(dir, handleEvents, backendOptions);
    } catch (err) {
      // Rollback: unsubscribe all successful subscriptions before re-throwing
      for (const prev of internal.subscriptions) {
        try {
          await resolvedBackend.unsubscribe(prev);
        } catch {
          // best-effort cleanup
        }
      }
      internal.subscriptions = [];
      throw err;
    }
    internal.subscriptions.push(sub);
  }

  for (const dir of paths) {
    await resolvedBackend.initialScan(dir, handleEvents, backendOptions);
  }

  return internal;
}

/**
 * Stop a file watcher and clear all pending debounce/settle timers.
 *
 * Clearing timers is critical: without it, pending setTimeout callbacks fire
 * after the watcher (and often the DB) are already closed, causing crashes
 * and orphaned file descriptors.
 *
 * @param watcher - LimpsWatcher handle from startWatcher()
 */
export async function stopWatcher(watcher: LimpsWatcher): Promise<void> {
  const internal = watcher as LimpsWatcherInternal;

  // Mark as closed so no new callbacks fire
  internal.closed = true;

  // Clear pending timers
  for (const timeout of internal.debounceMap.values()) {
    clearTimeout(timeout);
  }
  internal.debounceMap.clear();

  if (internal.settledTimer) {
    clearTimeout(internal.settledTimer);
    internal.settledTimer = null;
  }
  internal.settledChanges.clear();

  // Unsubscribe from all backends — attempt all even if some fail
  const results = await Promise.allSettled(
    internal.subscriptions.map((sub) => internal.backend.unsubscribe(sub))
  );
  internal.subscriptions = [];

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    const errors = failures.map((r) => (r as PromiseRejectedResult).reason as Error);
    throw new AggregateError(errors, `Failed to unsubscribe ${failures.length} watcher(s)`);
  }
}
