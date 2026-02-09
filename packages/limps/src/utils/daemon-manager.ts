/**
 * Daemon management utilities for ensuring the HTTP daemon is running.
 * Used by the `serve` command to start the daemon if not already running.
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { loadConfig, getHttpServerConfig } from '../config.js';
import { getPidFilePath, getRunningDaemon } from '../pidfile.js';
import { isDaemonHealthy, type HttpClientOptions } from './http-client.js';

/**
 * Information about a running daemon.
 */
export interface DaemonInfo {
  host: string;
  port: number;
  pid: number;
}

/**
 * Ensure the HTTP daemon is running. If it's not running, start it.
 * Polls for daemon health with a timeout.
 *
 * @param configPath - Path to the limps config file
 * @param timeoutMs - Maximum time to wait for daemon to start (default: 15000ms)
 * @returns DaemonInfo for the running daemon
 * @throws Error if daemon cannot be started within timeout
 */
export async function ensureDaemonRunning(
  configPath: string,
  timeoutMs = 15000
): Promise<DaemonInfo> {
  const config = loadConfig(configPath);
  const httpConfig = getHttpServerConfig(config);
  const pidFilePath = getPidFilePath(httpConfig.port);

  // Check if daemon is already running
  const existing = getRunningDaemon(pidFilePath);
  if (existing) {
    // Verify it's healthy
    const healthy = await isDaemonHealthy(existing.host, existing.port, {
      timeout: 3000,
      retries: 1,
      retryDelay: 500,
    });

    if (healthy) {
      return {
        host: existing.host,
        port: existing.port,
        pid: existing.pid,
      };
    }

    // Stale PID file, will be cleaned up by next start
    console.error(
      `[limps:serve] Found PID file but daemon not responding. Will attempt to start new daemon.`
    );
  }

  // Start daemon asynchronously
  console.error(`[limps:serve] Starting daemon on port ${httpConfig.port}...`);
  await spawnDaemon(configPath);

  // Poll for health with timeout
  const startTime = Date.now();
  const pollInterval = 500;
  const httpOptions: HttpClientOptions = {
    timeout: 1000,
    retries: 0,
  };

  while (Date.now() - startTime < timeoutMs) {
    const daemon = getRunningDaemon(pidFilePath);
    if (daemon) {
      const healthy = await isDaemonHealthy(daemon.host, daemon.port, httpOptions);

      if (healthy) {
        console.error(
          `[limps:serve] Daemon started successfully (PID ${daemon.pid}) on http://${daemon.host}:${daemon.port}/mcp`
        );
        return {
          host: daemon.host,
          port: daemon.port,
          pid: daemon.pid,
        };
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(
    `Failed to start daemon within ${timeoutMs}ms. Try running 'limps start' manually.`
  );
}

/**
 * Spawn the daemon process in detached mode.
 *
 * @param configPath - Path to the limps config file
 */
async function spawnDaemon(configPath: string): Promise<void> {
  // Get path to CLI entry point
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const cliPath = join(__dirname, '..', 'cli.js');

  const child = spawn(process.execPath, [cliPath, 'start', '--config', configPath], {
    detached: true,
    stdio: 'ignore',
  });

  child.unref(); // Allow parent to exit

  // Give it a moment to start
  await new Promise<void>((resolve) => setTimeout(resolve, 1000));
}
