#!/usr/bin/env node
/**
 * HTTP daemon entry point.
 * Spawned as a detached child process by `limps start`.
 * Reads config path from argv[2].
 */

import { startHttpServer, stopHttpServer } from './server-http.js';
import { logRedactedError } from './utils/safe-logging.js';

const configPath = process.argv[2];
const portFromEnv = process.env.LIMPS_HTTP_PORT;
const hostFromEnv = process.env.LIMPS_HTTP_HOST;
const daemonLogPathFromEnv = process.env.LIMPS_DAEMON_LOG_PATH;

function parsePort(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) return undefined;
  return parsed;
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`Received ${signal}, shutting down HTTP server...`);
  try {
    await stopHttpServer();
    process.exit(0);
  } catch (error) {
    logRedactedError('Error during shutdown', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  shutdown('SIGINT').catch(() => process.exit(1));
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch(() => process.exit(1));
});

process.on('uncaughtException', (error) => {
  logRedactedError('Uncaught exception', error);
  shutdown('uncaughtException').catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  logRedactedError('Unhandled rejection', reason);
  shutdown('unhandledRejection').catch(() => process.exit(1));
});

startHttpServer(configPath, {
  port: parsePort(portFromEnv),
  host: hostFromEnv || undefined,
  daemonLogPath: daemonLogPathFromEnv || undefined,
}).catch((err: Error) => {
  // Startup errors happen before request handling; message is operational and needed for diagnostics.
  console.error(`Failed to start HTTP server: ${err.message}`);
  process.exit(1);
});
