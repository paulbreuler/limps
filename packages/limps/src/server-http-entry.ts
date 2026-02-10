#!/usr/bin/env node
/**
 * HTTP daemon entry point.
 * Spawned as a detached child process by `limps start`.
 * Reads config path from argv[2].
 */

import { startHttpServer, stopHttpServer } from './server-http.js';
import { logRedactedError } from './utils/safe-logging.js';

const configPath = process.argv[2];

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

startHttpServer(configPath).catch((err: Error) => {
  logRedactedError('Failed to start HTTP server', err);
  process.exit(1);
});
