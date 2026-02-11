#!/usr/bin/env node
import Pastel from 'pastel';
import { getPackageVersion } from './utils/version.js';
import { startHttpServer, stopHttpServer } from './server-http.js';
import { logRedactedError } from './utils/safe-logging.js';
import { getCompletionSuggestions } from './core/completion.js';

const args = process.argv.slice(2);
const isCompletionRequest = process.env.LIMPS_COMPLETE === '1';

if (isCompletionRequest) {
  const separatorIndex = args.indexOf('--');
  const tokens = separatorIndex === -1 ? args : args.slice(separatorIndex + 1);
  const suggestions = getCompletionSuggestions(tokens, {
    configPath: process.env.MCP_PLANNING_CONFIG,
  });
  process.stdout.write(suggestions.join('\n'));
  process.exit(0);
}

// Check if running server start command with --foreground flag — bypass Ink for clean stdio
const isStartForeground =
  args.includes('--foreground') && args[0] === 'server' && args[1] === 'start';
const wantsHelp =
  args.includes('--help') || args.includes('-h') || (isStartForeground && args.includes('help'));

if (isStartForeground && !wantsHelp) {
  // Parse --config option
  const configIndex = args.indexOf('--config');
  const configPath = configIndex !== -1 ? args[configIndex + 1] : undefined;
  const portIndex = args.indexOf('--port');
  const hostIndex = args.indexOf('--host');
  const portArg = portIndex !== -1 ? args[portIndex + 1] : undefined;
  const hostArg = hostIndex !== -1 ? args[hostIndex + 1] : undefined;
  const port = portArg ? Number.parseInt(portArg, 10) : undefined;
  const host = hostArg || undefined;

  // Run HTTP server in foreground without Ink's terminal management
  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopHttpServer()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  startHttpServer(configPath, { port, host }).catch((err: Error) => {
    logRedactedError('Server error', err);
    process.exit(1);
  });
} else {
  const app = new Pastel({
    importMeta: import.meta,
    name: 'limps',
    version: getPackageVersion(),
    description: 'Local Intelligent MCP Planning Server',
  });

  await app.run();
}
