/**
 * rlm_query tool: Execute JavaScript code on a single document.
 * Feature #2: RLM Query Tool
 *
 * Enables Claude to load documents as environment variables and execute
 * filter/transform code before LLM reasoning.
 */

import { z } from 'zod';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import type { ToolContext, ToolResult } from '../types.js';
import { validatePath } from '../utils/paths.js';
import { notFound } from '../utils/errors.js';
import { createEnvironment, type DocVariable } from '../rlm/sandbox.js';
import { validateCode } from '../rlm/security.js';
import { processSubCalls } from '../rlm/recursion.js';
import type { SamplingClient } from '../rlm/sampling.js';

/**
 * Input schema for rlm_query tool.
 */
export const RlmQueryInputSchema = z.object({
  path: z.string().min(1).describe('Document path relative to repo root'),
  code: z.string().min(1).describe('JavaScript code to execute (doc variable available)'),
  sub_query: z.string().optional().describe('Prompt for recursive LLM processing of results'),
  timeout: z.number().int().min(100).max(30000).default(5000).describe('Execution timeout in ms'),
  max_depth: z
    .number()
    .int()
    .min(1)
    .max(3)
    .default(1)
    .describe('Maximum recursion depth for sub_query'),
});

export type RlmQueryInput = z.infer<typeof RlmQueryInputSchema>;

/**
 * Output interface for rlm_query tool.
 */
export interface RlmQueryOutput {
  result: unknown; // Code execution result
  sub_results?: unknown[]; // Results from sub_query processing (Agent 3 will implement)
  execution_time_ms: number;
  tokens_saved?: number; // Estimated tokens avoided by filtering
  metadata: {
    path: string;
    doc_size: number; // Original doc size in bytes
    result_size: number; // Filtered result size in bytes
    depth: number; // Current recursion depth
  };
}

/**
 * Get repository root from config.
 */
function getRepoRoot(config: ToolContext['config']): string {
  if (config.docsPaths && config.docsPaths.length > 0) {
    return config.docsPaths[0];
  }
  return dirname(config.plansPath);
}

/**
 * Estimate tokens saved by filtering.
 * Rough approximation: 4 characters per token.
 */
function estimateTokensSaved(docSize: number, resultSize: number): number {
  const charsSaved = docSize - resultSize;
  return Math.max(0, Math.floor(charsSaved / 4));
}

/**
 * Handle rlm_query tool request.
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result
 */
export async function handleRlmQuery(
  input: RlmQueryInput,
  context: ToolContext
): Promise<ToolResult> {
  const { path, code, sub_query, timeout = 5000 } = input;
  const { config } = context;

  try {
    // Get repo root
    const repoRoot = getRepoRoot(config);

    // Validate path BEFORE loading (per gotchas)
    const validated = validatePath(path, repoRoot);

    // Check if file exists
    if (!existsSync(validated.absolute)) {
      throw notFound(path);
    }

    // Read file stats and content
    const stats = await stat(validated.absolute);
    const content = await readFile(validated.absolute, 'utf-8');
    const docSize = Buffer.byteLength(content, 'utf-8');

    // Create DocVariable
    const docVar: DocVariable = {
      content,
      metadata: {
        path: validated.relative,
        size: docSize,
        lines: content === '' ? 0 : content.split('\n').length,
        modified: stats.mtime.toISOString(),
      },
      path: validated.relative,
    };

    // Validate code before execution (per TDD requirement)
    validateCode(code);

    // Create sandbox environment
    const env = await createEnvironment(docVar, { timeout });

    try {
      // Execute code
      const execResult = await env.execute<unknown>(code);

      // Calculate result size (serialize to estimate)
      const resultJson = JSON.stringify(execResult.result);
      const resultSize = Buffer.byteLength(resultJson, 'utf-8');

      // Estimate tokens saved
      const tokensSaved = estimateTokensSaved(docSize, resultSize);

      // Build output
      const output: RlmQueryOutput = {
        result: execResult.result,
        execution_time_ms: Math.max(1, Math.round(execResult.executionTimeMs)), // Ensure at least 1ms
        tokens_saved: tokensSaved,
        metadata: {
          path: validated.relative,
          doc_size: docSize,
          result_size: resultSize,
          depth: 0, // Current depth (updated if sub_query is processed)
        },
      };

      // Handle sub_query (Agent 3 implementation)
      if (sub_query) {
        try {
          // Get sampling client from context (if available)
          // For now, this will be undefined in real server, but tests can provide mock client
          const samplingClient = (context as ToolContext & { samplingClient?: SamplingClient })
            .samplingClient;

          // Normalize items to array
          const items = Array.isArray(execResult.result) ? execResult.result : [execResult.result];

          // Process sub-calls
          const subResults = await processSubCalls(items, sub_query, {
            maxDepth: input.max_depth ?? 1,
            concurrency: 5,
            timeout: timeout,
            samplingClient,
          });

          // Map results to output format
          output.sub_results = subResults.map((r) => (r.success ? r.result : { error: r.error }));
          output.metadata.depth = 1; // Update depth after processing sub-calls
        } catch (error) {
          // If sub-call processing fails, include error in sub_results
          const errorMessage = error instanceof Error ? error.message : String(error);
          output.sub_results = [
            {
              error: `Sub-call processing failed: ${errorMessage}`,
            },
          ];
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    } finally {
      // Always dispose environment
      env.dispose();
    }
  } catch (error) {
    // Handle DocumentError
    if (error instanceof Error && 'code' in error) {
      const docError = error as { code: string; message: string; path?: string };
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${docError.message}${docError.path ? ` (path: ${docError.path})` : ''}`,
          },
        ],
        isError: true,
      };
    }

    // Handle security errors
    if (error instanceof Error && error.name === 'SecurityError') {
      return {
        content: [
          {
            type: 'text',
            text: `Security error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }

    // Handle timeout errors
    if (error instanceof Error && error.name === 'TimeoutError') {
      return {
        content: [
          {
            type: 'text',
            text: `Execution timeout: ${error.message}`,
          },
        ],
        isError: true,
      };
    }

    // Handle memory errors
    if (error instanceof Error && error.name === 'MemoryError') {
      return {
        content: [
          {
            type: 'text',
            text: `Memory limit exceeded: ${error.message}`,
          },
        ],
        isError: true,
      };
    }

    // Handle file system errors
    if (error instanceof Error) {
      if ('code' in error && error.code === 'ENOENT') {
        throw notFound(path);
      }

      return {
        content: [
          {
            type: 'text',
            text: `Error executing query: ${error.message}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Unknown error: ${String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
