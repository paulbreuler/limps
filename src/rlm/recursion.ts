/**
 * Recursive sub-call handler for RLM queries.
 * Feature #5: Recursive Sub-Call Handler (MCP Spec 2025-11-25)
 *
 * Processes filtered results from RLM queries using MCP Sampling with Tools.
 * Enables server-side agent loops for recursive LLM processing.
 */

import { DepthLimitError } from '../utils/errors.js';
import { parallelMap, type ParallelOptions } from './parallel.js';
import {
  createSamplingMessage,
  type SamplingClient,
  type SamplingRequest,
  type ToolDefinition,
  type ToolCallResult,
} from './sampling.js';

/**
 * Context for sub-call processing, tracking depth and parent information.
 */
export interface SubCallContext {
  /** Current recursion depth */
  depth: number;
  /** Maximum allowed depth */
  maxDepth: number;
  /** Parent document path (optional) */
  parentPath?: string;
  /** MCP Task ID for long-running operations (optional, SEP-1686) */
  taskId?: string;
}

/**
 * Request for a single sub-call.
 */
export interface SubCallRequest {
  /** Item from code result to process */
  item: unknown;
  /** Prompt for sub_query */
  prompt: string;
  /** Sub-call context */
  context: SubCallContext;
}

/**
 * Result of a single sub-call.
 */
export interface SubCallResult {
  /** Whether the sub-call succeeded */
  success: boolean;
  /** LLM text output (if successful) */
  result?: string;
  /** Error message (if failed) */
  error?: string;
  /** Index in the original items array */
  index: number;
  /** Tool calls made during sampling (if any) */
  toolCalls?: ToolCallResult[];
}

/**
 * Options for recursive sub-call processing.
 */
export interface RecursionOptions {
  /** Maximum recursion depth (default: 1) */
  maxDepth?: number;
  /** Maximum concurrent sub-calls (default: 5) */
  concurrency?: number;
  /** Per-call timeout in milliseconds */
  timeout?: number;
  /** Tools available during sampling (SEP-1577) */
  tools?: ToolDefinition[];
  /** Return Task handle for long operations (SEP-1686, optional) */
  useTask?: boolean;
  /** Sampling client (optional, for testing/mocking) */
  samplingClient?: SamplingClient;
}

/**
 * Check if depth limit is exceeded and throw if so.
 *
 * @param context - Sub-call context
 * @throws DepthLimitError if depth exceeds maxDepth
 */
export function checkDepthLimit(context: SubCallContext): void {
  if (context.depth >= context.maxDepth) {
    throw new DepthLimitError(context.maxDepth, context.depth);
  }
}

/**
 * Process sub-calls for items returned from RLM query code execution.
 *
 * This function:
 * 1. Normalizes items to an array (handles single item)
 * 2. Checks depth limit
 * 3. Processes items in parallel with concurrency control
 * 4. For each item, creates a sampling message with the prompt
 * 5. Captures results and tool calls
 * 6. Returns aggregated results in input order
 *
 * @param items - Items from code result (array or single item)
 * @param prompt - Sub_query prompt to apply to each item
 * @param options - Recursion options
 * @returns Array of sub-call results in input order
 *
 * @example
 * const results = await processSubCalls(
 *   ['item1', 'item2', 'item3'],
 *   'Summarize each item',
 *   { maxDepth: 1, concurrency: 5 }
 * );
 */
export async function processSubCalls(
  items: unknown[] | unknown,
  prompt: string,
  options?: RecursionOptions
): Promise<SubCallResult[]> {
  const { maxDepth = 1, concurrency = 5, timeout, tools, samplingClient } = options || {};

  // Normalize items to array
  const itemsArray = Array.isArray(items) ? items : [items];

  if (itemsArray.length === 0) {
    return [];
  }

  // Create sub-call context
  const context: SubCallContext = {
    depth: 0, // Starting depth (will be incremented for nested calls)
    maxDepth,
  };

  // Check depth limit before processing
  checkDepthLimit(context);

  // Process items in parallel
  const parallelOptions: ParallelOptions = {
    concurrency,
    timeout,
  };

  const results = await parallelMap(
    itemsArray,
    async (item, index): Promise<SubCallResult> => {
      try {
        // Build prompt with item context
        const itemContext = JSON.stringify(item, null, 2);
        const fullPrompt = `${prompt}\n\nContext:\n${itemContext}`;

        // Create sampling request
        const samplingRequest: SamplingRequest = {
          messages: [{ role: 'user', content: fullPrompt }],
          tools,
          toolChoice: tools && tools.length > 0 ? 'auto' : 'none',
          maxTokens: 2000, // Default max tokens for sub-calls
        };

        // Call sampling (will throw if client not available)
        const response = await createSamplingMessage(samplingRequest, samplingClient);

        // Build result
        return {
          success: true,
          result: response.content,
          index,
          toolCalls: response.toolCalls,
        };
      } catch (error) {
        // Handle errors gracefully - don't throw, include in result
        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
          success: false,
          error: errorMessage,
          index,
        };
      }
    },
    parallelOptions
  );

  // Map parallel results to SubCallResult (they're already in the right format)
  return results.map((result) => {
    if (result.success) {
      return result.value;
    } else {
      // Find the index from the original items array
      // Since parallelMap preserves order, we can use the result index
      const index = results.indexOf(result);
      return {
        success: false,
        error: result.error,
        index,
      };
    }
  });
}
