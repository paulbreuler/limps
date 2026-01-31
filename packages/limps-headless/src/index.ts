import type {
  LimpsExtension,
  ExtensionContext,
} from '@sudosandwich/limps/extensions';
import {
  listPrimitivesTool,
  extractPrimitiveTool,
  diffVersionsTool,
  checkUpdatesTool,
  runAuditTool,
  generateReportTool,
} from './tools/index.js';

/**
 * limps-headless extension for headless UI contract extraction and analysis.
 */
const limpsHeadless: LimpsExtension = {
  name: 'limps-headless',
  version: '0.1.0',
  tools: [
    listPrimitivesTool,
    extractPrimitiveTool,
    diffVersionsTool,
    checkUpdatesTool,
    runAuditTool,
    generateReportTool,
  ],
  async onInit(_context: ExtensionContext) {
    // Initialize cache directory
    // This will be implemented by later agents
  },
};

export default limpsHeadless;

// Re-export types
export * from './types/index.js';

// Re-export signatures module
export * from './signatures/index.js';

// Re-export cache module
export * from './cache/index.js';

// Re-export providers module
export * from './providers/index.js';

// Re-export rules engine module
export * from './rules/index.js';

// Re-export differ module
export * from './differ/index.js';

// Re-export tools module (includes audit tool handlers and schemas)
export * from './tools/index.js';

// Config and policy options (Agent 0)
export * from './config.js';
export type { RunAuditOptions, BackendMode, MigrationThreshold, MigrationReadiness } from './audit/types.js';

// Migration analysis (Agent 2 #3)
export { analyzeMigration, computeMigrationSummary } from './audit/analyses/migration.js';
export type { MigrationSummary } from './audit/analyses/migration.js';
