/**
 * Version state management for tracking last seen version.
 * Used to determine when to show "What's New" notifications.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { getPackageVersion } from './version.js';

interface VersionState {
  lastSeenVersion: string;
}

/**
 * Get the OS-specific cache directory for limps.
 *
 * - macOS: ~/Library/Caches/limps
 * - Windows: %LOCALAPPDATA%/limps
 * - Linux: $XDG_CACHE_HOME/limps or ~/.cache/limps
 */
function getCachePath(): string {
  const home = homedir();

  switch (process.platform) {
    case 'darwin':
      return join(home, 'Library', 'Caches', 'limps');
    case 'win32':
      return join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'limps');
    default:
      return join(process.env.XDG_CACHE_HOME || join(home, '.cache'), 'limps');
  }
}

/**
 * Get the path to the version state file.
 */
function getVersionStatePath(): string {
  return join(getCachePath(), 'version-state.json');
}

/**
 * Compare two version strings using simple semantic versioning comparison.
 * Returns:
 * - negative if v1 < v2
 * - 0 if v1 === v2
 * - positive if v1 > v2
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;
    if (part1 < part2) return -1;
    if (part1 > part2) return 1;
  }
  return 0;
}

/**
 * Get the version state from disk, or create default state.
 * Defaults to current version (so first install doesn't show What's New).
 *
 * @returns Version state object
 */
export function getVersionState(): VersionState {
  const path = getVersionStatePath();
  const currentVersion = getPackageVersion();

  // If file doesn't exist, create it with current version
  if (!existsSync(path)) {
    const defaultState: VersionState = {
      lastSeenVersion: currentVersion,
    };
    // Ensure directory exists
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(defaultState, null, 2), 'utf-8');
    return defaultState;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const state = JSON.parse(content) as VersionState;

    // Validate structure
    if (!state.lastSeenVersion || typeof state.lastSeenVersion !== 'string') {
      // Reset to current version if invalid
      const defaultState: VersionState = {
        lastSeenVersion: currentVersion,
      };
      writeFileSync(path, JSON.stringify(defaultState, null, 2), 'utf-8');
      return defaultState;
    }

    return state;
  } catch (_error) {
    // Handle malformed JSON gracefully - reset to current version
    const defaultState: VersionState = {
      lastSeenVersion: currentVersion,
    };
    writeFileSync(path, JSON.stringify(defaultState, null, 2), 'utf-8');
    return defaultState;
  }
}

/**
 * Update the last seen version in the state file.
 *
 * @param version - Version string to set as last seen
 */
export function updateLastSeenVersion(version: string): void {
  const path = getVersionStatePath();
  const state: VersionState = {
    lastSeenVersion: version,
  };

  // Ensure directory exists
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Check if we should show "What's New" for the current version.
 * Returns true if current version is greater than last seen version.
 *
 * @param currentVersion - Current installed version (defaults to package version)
 * @returns True if What's New should be shown
 */
export function shouldShowWhatsNew(currentVersion?: string): boolean {
  const version = currentVersion || getPackageVersion();
  const state = getVersionState();

  // Compare versions - show if current > last seen
  return compareVersions(version, state.lastSeenVersion) > 0;
}
