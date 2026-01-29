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
 * limps-radix extension for Radix UI contract extraction and analysis.
 */
const limpsRadix: LimpsExtension = {
  name: 'limps-radix',
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

export default limpsRadix;

// Re-export types
export * from './types/index.js';

// Re-export signatures module
export * from './signatures/index.js';

// Re-export cache module
export * from './cache/index.js';

// Re-export providers module
export * from './providers/index.js';

// Re-export differ module
export * from './differ/index.js';

// Re-export tools module (includes audit tool handlers and schemas)
export * from './tools/index.js';
