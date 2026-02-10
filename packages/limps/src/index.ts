#!/usr/bin/env node
/**
 * MCP Planning Server entry point.
 *
 * This file is kept for backwards compatibility and direct server invocation.
 * For CLI usage, see src/cli.tsx which provides the full Pastel-based CLI.
 */

import { startMcpServer } from './server-main.js';
import { logRedactedError } from './utils/safe-logging.js';

// Parse --config argument for backwards compatibility
function getConfigArg(): string | undefined {
  const args = process.argv.slice(2);
  const configIndex = args.indexOf('--config');
  return configIndex !== -1 && args[configIndex + 1] ? args[configIndex + 1] : undefined;
}

startMcpServer(getConfigArg()).catch((error) => {
  logRedactedError('Fatal error', error);
  process.exit(1);
});
