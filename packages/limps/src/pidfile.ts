/**
 * PID file management for the limps HTTP daemon.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

/**
 * Contents of a PID file.
 */
export interface PidFileContents {
  pid: number;
  port: number;
  host: string;
  startedAt: string;
  configPath?: string; // Optional: track which config this daemon is using
}

/**
 * Get the system-level directory for storing limps PID files.
 * Uses ~/.limps/pids/ for persistence across sessions.
 *
 * @returns Path to the system-level PID directory
 */
export function getSystemPidDir(): string {
  const pidDir = join(homedir(), '.limps', 'pids');
  if (!existsSync(pidDir)) {
    mkdirSync(pidDir, { recursive: true });
  }
  return pidDir;
}

/**
 * Get the PID file path for a limps daemon.
 * Now stores in system-level directory (~/.limps/pids/) and uses port number
 * in filename so daemons can be tracked across all projects.
 *
 * @param dataPath - The data directory from config (for backward compatibility)
 * @param port - Port number for the daemon (required for new behavior)
 * @returns Path to the PID file
 */
export function getPidFilePath(dataPath: string, port?: number): string {
  if (port !== undefined) {
    // New behavior: system-level PID file named by port
    const systemPidDir = getSystemPidDir();
    return join(systemPidDir, `limps-${port}.pid`);
  }

  // Old behavior: per-project PID file (deprecated but kept for compatibility)
  return join(dataPath, 'limps.pid');
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
