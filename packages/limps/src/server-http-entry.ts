#!/usr/bin/env node
/**
 * HTTP daemon entry point.
 * Spawned as a detached child process by `limps start`.
 * Reads config path from argv[2].
 */

import { startHttpServer, stopHttpServer } from './server-http.js';

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
    console.error('Error during shutdown:', error);
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
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException').catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  shutdown('unhandledRejection').catch(() => process.exit(1));
});

startHttpServer(configPath).catch((err: Error) => {
  console.error(`Failed to start HTTP server: ${err.message}`);
  process.exit(1);
});
