/**
 * read_doc tool: Read full content of any document in the repository.
 */

import { z } from 'zod';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import type { ToolContext, ToolResult } from '../types.js';
import { validatePath } from '../utils/paths.js';
import { notFound } from '../utils/errors.js';

/**
 * Input schema for read_doc tool.
 */
export const ReadDocInputSchema = z.object({
  path: z.string().min(1).describe('Path relative to repo root'),
  lines: z
    .tuple([z.number().int().positive(), z.number().int().positive()])
    .optional()
    .describe('Optional line range [start, end], 1-indexed'),
});

export type ReadDocInput = z.infer<typeof ReadDocInputSchema>;

/**
 * Output interface for read_doc tool.
 */
export interface ReadDocOutput {
  path: string;
  content: string;
  metadata: {
    size: number;
    lines: number;
    modified: string; // ISO timestamp
    type: 'md' | 'jsx' | 'tsx' | 'ts' | 'json' | 'yaml' | 'other';
    partial?: boolean;
    range?: [number, number];
  };
}

/**
 * Get repository root from config.
 * Uses the first docsPath entry as the repo root, or derives from plansPath.
 */
function getRepoRoot(config: ToolContext['config']): string {
  // Prefer docsPaths[0] if it exists (it's the repo root)
  if (config.docsPaths && config.docsPaths.length > 0) {
    return config.docsPaths[0];
  }
  // Fallback: use plansPath parent directory
  return dirname(config.plansPath);
}

/**
 * Handle read_doc tool request.
 * Reads full file content with optional line range.
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result
 */
export async function handleReadDoc(
  input: ReadDocInput,
  context: ToolContext
): Promise<ToolResult> {
  const { path, lines } = input;
  const { config } = context;

  try {
    // Get repo root
    const repoRoot = getRepoRoot(config);

    // Validate path first
    const validated = validatePath(path, repoRoot);

    // Check if file exists
    if (!existsSync(validated.absolute)) {
      throw notFound(path);
    }

    // Read file stats
    const stats = await stat(validated.absolute);

    // Read file content
    const content = await readFile(validated.absolute, 'utf-8');

    // Count lines (empty file has 0 lines, not 1)
    const lineCount = content === '' ? 0 : content.split('\n').length;

    // Handle line range if specified
    let finalContent = content;
    let partial = false;
    let range: [number, number] | undefined;

    if (lines) {
      const [start, end] = lines;
      // Validate range
      if (start > end) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid line range: start (${start}) must be <= end (${end})`,
            },
          ],
          isError: true,
        };
      }

      if (start < 1 || end < 1) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid line range: line numbers must be >= 1`,
            },
          ],
          isError: true,
        };
      }

      // Convert 1-indexed to 0-indexed
      const startIdx = start - 1;
      const endIdx = end; // end is inclusive, so we use it directly for slice

      // Split into lines
      const contentLines = content.split('\n');

      // Validate range against file
      if (startIdx > contentLines.length) {
        return {
          content: [
            {
              type: 'text',
              text: `Line range [${start}, ${end}] exceeds file length (${lineCount} lines)`,
            },
          ],
          isError: true,
        };
      }

      // Extract range (endIdx is exclusive in slice, so we add 1)
      const endSlice = Math.min(endIdx, contentLines.length);
      const selectedLines = contentLines.slice(startIdx, endSlice);

      // Rejoin lines
      finalContent = selectedLines.join('\n');
      partial = true;
      range = [start, Math.min(end, lineCount)];
    }

    // Format output
    const output: ReadDocOutput = {
      path: validated.relative,
      content: finalContent,
      metadata: {
        size: stats.size,
        lines: lineCount,
        modified: stats.mtime.toISOString(),
        type: validated.type,
        ...(partial && { partial: true, range }),
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

    // Handle file system errors
    if (error instanceof Error) {
      // Check for ENOENT (file not found)
      if ('code' in error && error.code === 'ENOENT') {
        throw notFound(path);
      }

      return {
        content: [
          {
            type: 'text',
            text: `Error reading file: ${error.message}`,
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
