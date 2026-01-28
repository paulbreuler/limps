/**
 * RLM (Recursive Language Model) module exports.
 * Plan 0013: RLM Query Tool
 */

// Core sandbox exports
export {
  createEnvironment,
  type RlmEnvironment,
  type DocVariable,
  type SandboxOptions,
  type ExecutionResult,
  TimeoutError,
  MemoryError,
} from './sandbox.js';

// Security exports
export { validateCode, SecurityError, BLOCKED_APIS } from './security.js';

// Helper exports
export {
  extractSections,
  extractFrontmatter,
  extractCodeBlocks,
  extractFeatures,
  extractAgents,
  extractTasks,
  findByPattern,
  summarize,
  type CodeBlock,
  type Feature,
  type Agent,
  type Task,
  type Match,
} from './helpers.js';

// Extractor exports
export { parseMarkdownHeaders, parseYamlFrontmatter, parseGherkinScenarios } from './extractors.js';

// Parallel execution exports
export { parallelMap, type ParallelOptions, type ParallelResult } from './parallel.js';

// Sampling exports
export {
  createSamplingMessage,
  MockSamplingClient,
  type SamplingClient,
  type SamplingRequest,
  type SamplingResponse,
  type ToolDefinition,
  type ToolCallResult,
} from './sampling.js';

// Recursion exports
export {
  processSubCalls,
  checkDepthLimit,
  type SubCallContext,
  type SubCallRequest,
  type SubCallResult,
  type RecursionOptions,
} from './recursion.js';
