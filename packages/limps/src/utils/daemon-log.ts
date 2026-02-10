import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getAppDataPath } from './app-paths.js';

/**
 * Get the system-wide daemon log directory path.
 */
export function getSystemLogDir(): string {
  return join(getAppDataPath(), 'logs');
}

/**
 * Ensure the system-wide daemon log directory exists.
 */
export function ensureSystemLogDir(): string {
  const logDir = getSystemLogDir();
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

/**
 * Get the daemon log file path for a given port.
 */
export function getDaemonLogPath(port: number): string {
  const logDir = getSystemLogDir();
  return join(logDir, `limps-${port}.log`);
}
