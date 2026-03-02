/**
 * Filesystem-based event hook runner.
 *
 * Discovers and executes hook files from `hooksPath` in response to lifecycle
 * events. Hooks are non-blocking: wrapped in a 5-second timeout, errors are
 * logged but never propagate to the caller.
 *
 * Hook file resolution order (first match wins):
 *   1. {hooksPath}/{event}.mjs
 *   2. {hooksPath}/{event}.js
 *   3. {hooksPath}/{event}/index.mjs
 *   4. {hooksPath}/{event}/index.js
 */

import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { pathToFileURL } from 'url';
import type { HookEvent, HookFn, HookPayload } from './types.js';

const HOOK_TIMEOUT_MS = 5_000;

/**
 * Default hooks directory.
 */
export const DEFAULT_HOOKS_PATH = join(homedir(), '.limps', 'hooks');

/**
 * Race a promise against a timeout, rejecting if the timeout fires first.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Resolve the filesystem path for a hook file.
 * Returns `null` when no matching file exists.
 */
function resolveHookPath(hooksPath: string, event: HookEvent): string | null {
  const candidates = [
    join(hooksPath, `${event}.mjs`),
    join(hooksPath, `${event}.js`),
    join(hooksPath, event, 'index.mjs'),
    join(hooksPath, event, 'index.js'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Run hooks for a lifecycle event.
 *
 * @param event - Hook event name
 * @param data - Event-specific payload data
 * @param hooksPath - Directory to search for hook files (default: ~/.limps/hooks/)
 */
export async function runHooks(
  event: HookEvent,
  data: Record<string, unknown>,
  hooksPath?: string
): Promise<void> {
  const dir = hooksPath ? resolve(hooksPath) : DEFAULT_HOOKS_PATH;

  // Fast exit — hooks directory doesn't exist
  if (!existsSync(dir)) {
    return;
  }

  const hookPath = resolveHookPath(dir, event);
  if (!hookPath) {
    return;
  }

  const payload: HookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  try {
    const hookModule = (await withTimeout(
      import(pathToFileURL(hookPath).href),
      HOOK_TIMEOUT_MS,
      'Hook import'
    )) as { default?: HookFn };

    const fn = hookModule.default;
    if (typeof fn !== 'function') {
      console.error(
        `[limps:hooks] ${event}: hook file has no default export function: ${hookPath}`
      );
      return;
    }

    await withTimeout(Promise.resolve(fn(payload)), HOOK_TIMEOUT_MS, 'Hook execution');
  } catch (err) {
    // Hooks must never crash the server
    console.error(
      `[limps:hooks] ${event}: hook failed (${hookPath}):`,
      err instanceof Error ? err.message : String(err)
    );
  }
}
