#!/usr/bin/env node
import Pastel from 'pastel';
import updateNotifier from 'update-notifier';
import { getPackageVersion, getPackageName } from './utils/version.js';

// Initialize update notifier for automatic update checks
// This runs asynchronously in the background and won't block CLI startup
const pkg = {
  name: getPackageName(),
  version: getPackageVersion(),
};

updateNotifier({
  pkg,
  updateCheckInterval: 1000 * 60 * 60 * 24 * 7, // Check once per week
}).notify();

const app = new Pastel({
  importMeta: import.meta,
  name: 'limps',
  version: getPackageVersion(),
  description: 'Local Intelligent MCP Planning Server',
});

await app.run();
