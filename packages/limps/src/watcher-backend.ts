/**
 * Watcher backend abstraction.
 *
 * Decouples the orchestration logic in watcher.ts from the underlying
 * filesystem-watching library.  Swap backends by providing a different
 * WatcherBackend implementation — no changes needed in watcher.ts.
 */

import watcher from '@parcel/watcher';
import type { AsyncSubscription } from '@parcel/watcher';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import micromatch from 'micromatch';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface RawWatchEvent {
  type: 'create' | 'update' | 'delete';
  path: string;
}

export interface WatcherBackendOptions {
  ignoreGlobs: string[];
}

export interface WatcherSubscription {
  readonly id: string;
}

export interface WatcherBackend {
  subscribe(
    dir: string,
    callback: (events: RawWatchEvent[]) => void,
    options: WatcherBackendOptions
  ): Promise<WatcherSubscription>;

  initialScan(
    dir: string,
    callback: (events: RawWatchEvent[]) => void,
    options: WatcherBackendOptions
  ): Promise<void>;

  unsubscribe(subscription: WatcherSubscription): Promise<void>;
}

// ---------------------------------------------------------------------------
// ParcelWatcherBackend
// ---------------------------------------------------------------------------

export class ParcelWatcherBackend implements WatcherBackend {
  private subs = new Map<string, AsyncSubscription>();
  private nextSubId = 0;

  async subscribe(
    dir: string,
    callback: (events: RawWatchEvent[]) => void,
    options: WatcherBackendOptions
  ): Promise<WatcherSubscription> {
    const id = String(this.nextSubId++);

    const parcelIgnore = options.ignoreGlobs.map((g) => join(dir, g));

    const sub = await watcher.subscribe(
      dir,
      (err, events) => {
        if (err) {
          // Surface as a synthetic error event so the caller can handle it
          // (e.g. EMFILE on Linux with inotify)
          const code = (err as NodeJS.ErrnoException).code;
          if (code === 'EMFILE' || code === 'ENFILE') {
            console.error(
              `[limps] Too many open files (${code}). ` +
                `Your OS file descriptor limit may be too low for the number of watched files. ` +
                `Try: ulimit -n 4096`
            );
          }
          console.error('Watcher error:', err);
          return;
        }

        const mapped: RawWatchEvent[] = events.map((e) => ({
          type: e.type,
          path: e.path,
        }));

        if (mapped.length > 0) {
          callback(mapped);
        }
      },
      {
        ignore: parcelIgnore,
      }
    );

    this.subs.set(id, sub);
    return { id };
  }

  async initialScan(
    dir: string,
    callback: (events: RawWatchEvent[]) => void,
    options: WatcherBackendOptions
  ): Promise<void> {
    const events: RawWatchEvent[] = [];

    const walk = (current: string): void => {
      let entries: string[];
      try {
        entries = readdirSync(current);
      } catch {
        return; // permission error or similar — skip
      }

      for (const entry of entries) {
        const fullPath = join(current, entry);
        const relPath = relative(dir, fullPath);

        // Check ignore globs against relative path
        if (micromatch.isMatch(relPath, options.ignoreGlobs, { dot: true })) {
          continue;
        }

        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            // Check directory path with trailing separator to match dir globs
            // (e.g. "**/node_modules/**") before recursing into it
            const relDir = relPath + '/';
            if (!micromatch.isMatch(relDir, options.ignoreGlobs, { dot: true })) {
              walk(fullPath);
            }
          } else if (stat.isFile()) {
            events.push({ type: 'create', path: fullPath });
          }
        } catch {
          // stat failed — skip
        }
      }
    };

    walk(dir);

    if (events.length > 0) {
      callback(events);
    }
  }

  async unsubscribe(subscription: WatcherSubscription): Promise<void> {
    const sub = this.subs.get(subscription.id);
    if (sub) {
      await sub.unsubscribe();
      this.subs.delete(subscription.id);
    }
  }
}
