/**
 * Port availability and process detection utilities.
 */

import { execSync } from 'child_process';

export interface ProcessInfo {
  pid: number;
  name: string;
  command: string;
}

/**
 * Find the process using a specific port.
 *
 * @param port - Port number to check
 * @returns Process information if found, null otherwise
 */
export function findProcessUsingPort(port: number): ProcessInfo | null {
  try {
    // Use lsof to find the process
    // -i :PORT finds processes using the port
    // -t returns only PIDs
    // -P shows port numbers instead of service names
    const output = execSync(`lsof -i :${port} -t -P`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'], // Suppress stderr
    }).trim();

    if (!output) return null;

    const pid = parseInt(output.split('\n')[0], 10);
    if (isNaN(pid)) return null;

    // Get process details using ps
    const psOutput = execSync(`ps -p ${pid} -o comm=,command=`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    if (!psOutput) return null;

    // Parse ps output: first column is command name, rest is full command
    const lines = psOutput.split('\n');
    if (lines.length === 0) return null;

    const parts = lines[0].trim().split(/\s+/);
    const name = parts[0] || 'unknown';
    const command = parts.slice(1).join(' ') || name;

    return { pid, name, command };
  } catch {
    // lsof or ps failed (command not found, no permission, etc.)
    return null;
  }
}

/**
 * Check if a port is available.
 *
 * @param port - Port number to check
 * @returns true if available, false if in use
 */
export function isPortAvailable(port: number): boolean {
  return findProcessUsingPort(port) === null;
}
