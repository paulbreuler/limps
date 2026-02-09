/**
 * PID file management for the limps HTTP daemon.
 *
 * PID files are stored in OS-standard application directories:
 * - macOS: ~/Library/Application Support/limps/pids/
 * - Windows: %APPDATA%/limps/pids/
 * - Linux: $XDG_DATA_HOME/limps/pids/ or ~/.local/share/limps/pids/
 *
 * This allows system-wide awareness of which ports are in use.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { getAppDataPath } from './utils/app-paths.js';

/**
 * Contents of a PID file.
 */
export interface PidFileContents {
  pid: number;
  port: number;
  host: string;
  startedAt: string;
  configPath?: string;
}

/**
 * Get the system-wide PID directory.
 * Creates the directory if it doesn't exist.
 *
 * @returns Path to the system PID directory
 * @throws Error if directory cannot be created (e.g., permission denied, read-only filesystem)
 */
export function getSystemPidDir(): string {
  const pidDir = join(getAppDataPath(), 'pids');
  if (!existsSync(pidDir)) {
    try {
      mkdirSync(pidDir, { recursive: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create PID directory at ${pidDir}: ${message}`);
    }
  }
  return pidDir;
}

/**
 * Get the PID file path for a given port.
 *
 * PID files are stored system-wide by port number to prevent
 * duplicate daemons on the same port across different projects.
 *
 * @param port - The HTTP server port
 * @returns Path to the PID file (e.g., ~/Library/Application Support/limps/pids/limps-4269.pid)
 */
export function getPidFilePath(port: number): string {
  const systemPidDir = getSystemPidDir();
  return join(systemPidDir, `limps-${port}.pid`);
}

/**
 * Write a PID file.
 *
 * @param pidFilePath - Path to write the PID file
 * @param contents - PID file contents
 */
export function writePidFile(pidFilePath: string, contents: PidFileContents): void {
  mkdirSync(dirname(pidFilePath), { recursive: true });
  writeFileSync(pidFilePath, JSON.stringify(contents, null, 2), 'utf-8');
}

/**
 * Read a PID file.
 *
 * @param pidFilePath - Path to the PID file
 * @returns PID file contents, or null if file doesn't exist or is invalid
 */
export function readPidFile(pidFilePath: string): PidFileContents | null {
  if (!existsSync(pidFilePath)) {
    return null;
  }
  try {
    const raw = readFileSync(pidFilePath, 'utf-8');
    const parsed = JSON.parse(raw) as PidFileContents;
    // Validate all required fields
    if (
      typeof parsed.pid !== 'number' ||
      typeof parsed.port !== 'number' ||
      typeof parsed.host !== 'string' ||
      parsed.host.length === 0 ||
      typeof parsed.startedAt !== 'string' ||
      parsed.startedAt.length === 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Remove a PID file.
 *
 * @param pidFilePath - Path to the PID file
 */
export function removePidFile(pidFilePath: string): void {
  try {
    if (existsSync(pidFilePath)) {
      unlinkSync(pidFilePath);
    }
  } catch {
    // Best-effort removal
  }
}

/**
 * Check if a process is still running.
 *
 * @param pid - Process ID to check
 * @returns true if the process is running
 */
export function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 tests for process existence without actually sending a signal
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read PID file and check if the daemon is actually running.
 * Cleans up stale PID files automatically.
 *
 * @param pidFilePath - Path to the PID file
 * @returns PID file contents if daemon is running, null otherwise
 */
export function getRunningDaemon(pidFilePath: string): PidFileContents | null {
  const contents = readPidFile(pidFilePath);
  if (!contents) {
    return null;
  }
  if (!isProcessRunning(contents.pid)) {
    // Stale PID file — clean it up
    removePidFile(pidFilePath);
    return null;
  }
  return contents;
}

/**
 * Scan the system PID directory and return all running daemons.
 * Cleans up stale PID files automatically.
 *
 * @returns Array of PID file contents for all running daemons
 */
export function discoverRunningDaemons(): PidFileContents[] {
  const pidDir = getSystemPidDir();
  const results: PidFileContents[] = [];

  let entries: string[];
  try {
    entries = readdirSync(pidDir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.startsWith('limps-') || !entry.endsWith('.pid')) {
      continue;
    }
    const filePath = join(pidDir, entry);
    const daemon = getRunningDaemon(filePath);
    if (daemon) {
      results.push(daemon);
    }
  }

  return results;
}
