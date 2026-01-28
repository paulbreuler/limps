import type { LimpsExtension } from '@sudosandwich/limps/extensions';

/**
 * limps-radix extension for Radix UI contract extraction and analysis.
 */
const limpsRadix: LimpsExtension = {
  name: 'limps-radix',
  version: '0.1.0',
  tools: [], // Added by later agents
  async onInit(_context) {
    // Initialize cache directory
    // This will be implemented by later agents
  },
};

export default limpsRadix;

// Re-export types
export * from './types/index.js';
