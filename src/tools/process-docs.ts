/**
 * process_docs tool: Process multiple documents with JavaScript code for cross-document analysis.
 * Use glob patterns or explicit paths.
 *
 * Enables cross-document analysis with glob patterns or explicit paths.
 */

import { z } from 'zod';
import { readFile, stat, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import micromatch from 'micromatch';
import type { ToolContext, ToolResult } from '../types.js';
import { validatePath } from '../utils/paths.js';
import { validationError } from '../utils/errors.js';
import { createEnvironment, type DocVariable } from '../rlm/sandbox.js';
import { validateCode } from '../rlm/security.js';
import { processSubCalls } from '../rlm/recursion.js';
import type { SamplingClient } from '../rlm/sampling.js';

/**
 * Base input schema for process_docs tool (for registration).
 */
export const ProcessDocsInputBaseSchema = z.object({
  paths: z.array(z.string().min(1)).optional().describe('Explicit list of document paths'),
  pattern: z.string().optional().describe('Glob pattern (e.g., "plans/*/plan.md")'),
  code: z.string().min(1).describe('JavaScript code to execute (docs array available)'),
  sub_query: z.string().optional().describe('Prompt for recursive LLM processing'),
  timeout: z.number().int().min(100).max(30000).default(5000),
  max_docs: z.number().int().min(1).max(50).default(20).describe('Maximum documents to load'),
});

/**
 * Input schema for process_docs tool (with validation).
 */
export const ProcessDocsInputSchema = ProcessDocsInputBaseSchema.refine(
  (data) => data.paths || data.pattern,
  {
    message: 'Either paths or pattern must be provided',
  }
).refine((data) => !(data.paths && data.pattern), {
  message: 'Cannot provide both paths and pattern',
});

export type ProcessDocsInput = z.infer<typeof ProcessDocsInputSchema>;

/**
 * Output interface for process_docs tool.
 */
export interface ProcessDocsOutput {
  result: unknown;
  docs_loaded: number;
  execution_time_ms: number;
  sub_results?: unknown[]; // Results from sub_query processing (Agent 3 will implement)
  metadata: {
    paths: string[];
    total_size: number; // Total size of all loaded documents
    result_size: number; // Size of filtered result
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
 * Recursively find files matching a glob pattern.
 *
 * @param repoRoot - Repository root directory
 * @param pattern - Glob pattern (e.g., "plans/**\/plan.md")
 * @param maxDepth - Maximum directory depth to search
 * @returns Array of relative file paths
 */
async function resolveGlobPattern(
  repoRoot: string,
  pattern: string,
  maxDepth = 10
): Promise<string[]> {
  const matches: string[] = [];

  async function walkDirectory(
    dirPath: string,
    _relativePath: string,
    currentDepth: number
  ): Promise<void> {
    if (currentDepth > maxDepth) {
      return;
    }

    if (!existsSync(dirPath)) {
      return;
    }

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden files and directories
        if (entry.name.startsWith('.')) {
          continue;
        }

        const fullPath = join(dirPath, entry.name);
        const entryRelativePath = _relativePath ? join(_relativePath, entry.name) : entry.name;

        if (entry.isDirectory()) {
          // Recurse into subdirectories
          await walkDirectory(fullPath, entryRelativePath, currentDepth + 1);
        } else if (entry.isFile()) {
          // Check if file matches pattern
          // Convert pattern to match against relative path from repo root
          if (micromatch.isMatch(entryRelativePath, pattern)) {
            matches.push(entryRelativePath);
          }
        }
      }
    } catch {
      // Ignore permission errors or other issues
    }
  }

  await walkDirectory(repoRoot, '', 0);
  return matches;
}

/**
 * Load a document and create DocVariable.
 */
async function loadDocument(repoRoot: string, relativePath: string): Promise<DocVariable | null> {
  try {
    // Validate path
    const validated = validatePath(relativePath, repoRoot);

    // Check if file exists
    if (!existsSync(validated.absolute)) {
      return null;
    }

    // Read file stats and content
    const stats = await stat(validated.absolute);
    const content = await readFile(validated.absolute, 'utf-8');
    const docSize = Buffer.byteLength(content, 'utf-8');

    return {
      content,
      metadata: {
        path: validated.relative,
        size: docSize,
        lines: content === '' ? 0 : content.split('\n').length,
        modified: stats.mtime.toISOString(),
      },
      path: validated.relative,
    };
  } catch {
    // Return null if file can't be loaded
    return null;
  }
}

/**
 * Handle process_docs tool request.
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result
 */
export async function handleProcessDocs(
  input: ProcessDocsInput,
  context: ToolContext
): Promise<ToolResult> {
  // Validate input (defense in depth - should already be validated by tool registration)
  try {
    ProcessDocsInputSchema.parse(input);
  } catch (error) {
    // Handle Zod validation errors
    if (error && typeof error === 'object' && 'issues' in error) {
      const zodError = error as { issues: { message: string }[] };
      return {
        content: [
          {
            type: 'text',
            text: `Validation error: ${zodError.issues.map((i) => i.message).join(', ')}`,
          },
        ],
        isError: true,
      };
    }
    throw error;
  }

  const { paths, pattern, code, sub_query, timeout = 5000, max_docs = 20 } = input;
  const { config } = context;

  try {
    // Get repo root
    const repoRoot = getRepoRoot(config);

    // Resolve document paths
    let docPaths: string[] = [];

    if (paths) {
      // Use explicit paths
      docPaths = paths;
    } else if (pattern) {
      // Resolve glob pattern
      const matchedPaths = await resolveGlobPattern(repoRoot, pattern);

      // Enforce max_docs limit
      if (matchedPaths.length > max_docs) {
        throw validationError(
          'pattern',
          `Pattern matched ${matchedPaths.length} documents, exceeding max_docs limit of ${max_docs}`
        );
      }

      docPaths = matchedPaths;
    }

    // Empty result (0 docs) should return empty array, not error (per gotchas)
    if (docPaths.length === 0) {
      const output: ProcessDocsOutput = {
        result: [],
        docs_loaded: 0,
        execution_time_ms: 0,
        metadata: {
          paths: [],
          total_size: 0,
          result_size: 0,
        },
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    }

    // Load all documents
    const docPromises = docPaths.map((path) => loadDocument(repoRoot, path));
    const docResults = await Promise.all(docPromises);

    // Filter out nulls (files that couldn't be loaded)
    const docs: DocVariable[] = docResults.filter((doc): doc is DocVariable => doc !== null);

    // Validate code before execution
    validateCode(code);

    // Calculate total size
    const totalSize = docs.reduce((sum, doc) => sum + doc.metadata.size, 0);

    // Create sandbox environment with docs array
    const env = await createEnvironment(docs, { timeout });

    try {
      // Execute code
      const execResult = await env.execute<unknown>(code);

      // Calculate result size
      const resultJson = JSON.stringify(execResult.result);
      const resultSize = Buffer.byteLength(resultJson, 'utf-8');

      // Build output
      const output: ProcessDocsOutput = {
        result: execResult.result,
        docs_loaded: docs.length,
        execution_time_ms: Math.max(1, Math.round(execResult.executionTimeMs)), // Ensure at least 1ms
        metadata: {
          paths: docs.map((doc) => doc.path),
          total_size: totalSize,
          result_size: resultSize,
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
            maxDepth: 1, // Default to 1 for multi-query (can be made configurable later)
            concurrency: 5,
            timeout: timeout,
            samplingClient,
          });

          // Map results to output format
          output.sub_results = subResults.map((r) => (r.success ? r.result : { error: r.error }));
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
    // Handle Zod validation errors
    if (error && typeof error === 'object' && 'issues' in error) {
      const zodError = error as { issues: { message: string }[] };
      return {
        content: [
          {
            type: 'text',
            text: `Validation error: ${zodError.issues.map((i) => i.message).join(', ')}`,
          },
        ],
        isError: true,
      };
    }

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

    // Handle other errors
    if (error instanceof Error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error executing multi-query: ${error.message}`,
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
