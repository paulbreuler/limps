#!/usr/bin/env node
import Pastel from 'pastel';
import { getPackageVersion } from './utils/version.js';
import { startMcpServer } from './server-main.js';

// Check if running serve command - needs clean stdio, bypass Pastel/Ink
const args = process.argv.slice(2);
const isServeCommand = args[0] === 'serve';
const wantsHelp =
  args.includes('--help') || args.includes('-h') || (isServeCommand && args.includes('help'));

if (isServeCommand && !wantsHelp) {
  // Parse --config option
  const configIndex = args.indexOf('--config');
  const configPath = configIndex !== -1 ? args[configIndex + 1] : undefined;

  // Run server directly without Ink's terminal management
  console.error('MCP Planning Server running on stdio');
  startMcpServer(configPath).catch((err: Error) => {
    console.error(`Server error: ${err.message}`);
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
