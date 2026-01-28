/**
 * open_document_in_cursor tool: Open files in Cursor editor using URI protocol with CLI fallback.
 */

import { z } from 'zod';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { spawn } from 'child_process';
import open from 'open';
import which from 'which';
import type { ToolContext, ToolResult } from '../types.js';
import { validatePath } from '../utils/paths.js';
import { notFound } from '../utils/errors.js';

/**
 * Input schema for open_document_in_cursor tool.
 */
export const OpenDocumentInputSchema = z.object({
  path: z.string().min(1).describe('Path relative to repo root'),
  line: z.number().int().positive().optional().describe('Optional line number to jump to'),
  column: z.number().int().positive().optional().describe('Optional column number'),
});

export type OpenDocumentInput = z.infer<typeof OpenDocumentInputSchema>;

/**
 * Output interface for open_document_in_cursor tool.
 */
export interface OpenDocumentOutput {
  success: boolean;
  method?: 'uri' | 'cli'; // Method used to open file
  message?: string;
  error?: string; // Error message if failed
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
 * URL encode special characters in path for URI protocol.
 * Encodes: # → %23, ? → %3F, spaces → %20
 */
function encodePathForUri(path: string): string {
  return path.replace(/#/g, '%23').replace(/\?/g, '%3F').replace(/ /g, '%20');
}

/**
 * Check if cursor CLI is available on the system.
 *
 * @returns true if cursor command is available, false otherwise
 */
export function isCursorCliAvailable(): boolean {
  try {
    which.sync('cursor');
    return true;
  } catch {
    return false;
  }
}

/**
 * Open a file in Cursor using URI protocol with CLI fallback.
 *
 * @param filePath - Absolute path to the file
 * @param options - Optional line and column numbers
 * @returns Result indicating success and method used
 */
export async function openInCursor(
  filePath: string,
  options?: { line?: number; column?: number }
): Promise<{ success: boolean; method: 'uri' | 'cli' | 'failed'; error?: string }> {
  // Try URI protocol first
  try {
    // URL encode the path portion only
    const encodedPath = encodePathForUri(filePath);

    let uri = `cursor://file${encodedPath}`;

    if (options?.line !== undefined) {
      uri += `:${options.line}`;
      if (options.column !== undefined) {
        uri += `:${options.column}`;
      }
    }

    await open(uri, { wait: false });
    return { success: true, method: 'uri' };
  } catch (uriError) {
    // URI failed, try CLI fallback
    if (isCursorCliAvailable()) {
      try {
        const args: string[] = [];

        if (options?.line !== undefined) {
          const location = `${filePath}:${options.line}${
            options.column !== undefined ? `:${options.column}` : ''
          }`;
          args.push('-g', location);
        } else {
          args.push(filePath);
        }

        const child = spawn('cursor', args, {
          detached: true,
          stdio: 'ignore',
          shell: process.platform === 'win32',
        });

        child.unref();

        return { success: true, method: 'cli' };
      } catch (cliError) {
        return {
          success: false,
          method: 'failed',
          error: `CLI fallback failed: ${cliError instanceof Error ? cliError.message : String(cliError)}`,
        };
      }
    }

    return {
      success: false,
      method: 'failed',
      error: `URI protocol failed and cursor CLI is not available: ${uriError instanceof Error ? uriError.message : String(uriError)}`,
    };
  }
}

/**
 * Handle open_document_in_cursor tool request.
 * Opens a file in Cursor editor at an optional line/column position.
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result
 */
export async function handleOpenDocumentInCursor(
  input: OpenDocumentInput,
  context: ToolContext
): Promise<ToolResult> {
  const { path, line, column } = input;
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

    // Open file in Cursor
    const result = await openInCursor(validated.absolute, { line, column });

    if (!result.success) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: result.error || 'Failed to open file in Cursor',
              } as OpenDocumentOutput,
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    // Format success output (result.method is 'uri' | 'cli' at this point since success is true)
    const output: OpenDocumentOutput = {
      success: true,
      method: result.method as 'uri' | 'cli',
      message: `Opened ${validated.relative}${line ? ` at line ${line}` : ''}${
        column ? `, column ${column}` : ''
      } using ${result.method} method`,
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
            text: JSON.stringify(
              {
                success: false,
                error: docError.message,
              } as OpenDocumentOutput,
              null,
              2
            ),
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
            text: JSON.stringify(
              {
                success: false,
                error: `Error opening file: ${error.message}`,
              } as OpenDocumentOutput,
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: `Unknown error: ${String(error)}`,
            } as OpenDocumentOutput,
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}
