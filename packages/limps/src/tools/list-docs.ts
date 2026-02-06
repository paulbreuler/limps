/**
 * list_docs tool: List files and directories with optional filtering.
 */

import { z } from 'zod';
import { readdir, lstat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import micromatch from 'micromatch';
import type { ToolContext, ToolResult } from '../types.js';
import { validatePath } from '../utils/paths.js';
import { notFound } from '../utils/errors.js';
import { getRepoRoot } from '../utils/repo-root.js';

/**
 * Input schema for list_docs tool.
 */
export const ListDocsInputSchema = z.object({
  path: z.string().default('').describe('Directory path relative to repo root'),
  pattern: z.string().optional().describe('Glob pattern, e.g., "*.md"'),
  depth: z.number().int().min(1).max(5).default(2).describe('Max directory depth'),
  includeHidden: z.boolean().default(false).describe('Include hidden files'),
  prettyPrint: z
    .boolean()
    .default(false)
    .describe('Format JSON response with indentation (default: false)'),
});

export type ListDocsInput = z.infer<typeof ListDocsInputSchema>;

/**
 * Directory entry interface.
 */
export interface DirEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number; // bytes, files only
  children?: number; // count, directories only
  modified?: string; // ISO timestamp
}

/**
 * Output interface for list_docs tool.
 */
export interface ListDocsOutput {
  path: string;
  entries: DirEntry[];
  total: number;
}

/**
 * Check if a name matches a glob pattern.
 */
function matchesPattern(name: string, pattern: string): boolean {
  return micromatch.isMatch(name, pattern);
}

/**
 * Recursively list directory entries with depth control.
 */
async function listDirectoryRecursive(
  dirPath: string,
  repoRoot: string,
  relativePath: string,
  options: {
    pattern?: string;
    maxDepth: number;
    currentDepth: number;
    includeHidden: boolean;
  }
): Promise<DirEntry[]> {
  const entries: DirEntry[] = [];

  // Check if directory exists
  if (!existsSync(dirPath)) {
    return entries;
  }

  // Read directory entries
  const dirents = await readdir(dirPath, { withFileTypes: true });

  // Sort: directories first, then alphabetical
  dirents.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) {
      return -1;
    }
    if (!a.isDirectory() && b.isDirectory()) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });

  for (const dirent of dirents) {
    // Skip hidden files unless included
    if (!options.includeHidden && dirent.name.startsWith('.')) {
      continue;
    }

    // Apply pattern filter if specified
    if (options.pattern && !matchesPattern(dirent.name, options.pattern)) {
      continue;
    }

    const entryPath = join(dirPath, dirent.name);
    const entryRelativePath = relativePath ? join(relativePath, dirent.name) : dirent.name;

    if (dirent.isDirectory()) {
      // Get directory stats
      const stats = await lstat(entryPath);

      // Count children if within depth limit
      let children: number | undefined;
      if (options.currentDepth < options.maxDepth) {
        try {
          const childEntries = await readdir(entryPath);
          children = childEntries.length;
        } catch {
          // If we can't read children, don't include count
          children = undefined;
        }
      } else {
        // At max depth, summarize as "[N items]"
        try {
          const childEntries = await readdir(entryPath);
          children = childEntries.length;
        } catch {
          children = undefined;
        }
      }

      entries.push({
        name: dirent.name,
        type: 'directory',
        children,
        modified: stats.mtime.toISOString(),
      });

      // Recurse if within depth limit
      if (options.currentDepth < options.maxDepth) {
        const nestedEntries = await listDirectoryRecursive(entryPath, repoRoot, entryRelativePath, {
          ...options,
          currentDepth: options.currentDepth + 1,
        });

        // Add nested entries with indentation or prefix
        // For now, we'll flatten them but could add a prefix
        entries.push(...nestedEntries);
      }
    } else {
      // File entry
      const stats = await lstat(entryPath);

      entries.push({
        name: dirent.name,
        type: 'file',
        size: stats.size,
        modified: stats.mtime.toISOString(),
      });
    }
  }

  return entries;
}

/**
 * Handle list_docs tool request.
 * Lists directory contents with optional filtering.
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result
 */
export async function handleListDocs(
  input: ListDocsInput,
  context: ToolContext
): Promise<ToolResult> {
  const { path, pattern, depth = 2, includeHidden = false, prettyPrint = false } = input;
  const { config } = context;

  try {
    // Get repo root
    const repoRoot = getRepoRoot(config);

    // Validate path (for directory, we allow empty string for root)
    const dirPath = path || '';
    let validated;
    if (!dirPath) {
      // Empty path means repo root
      validated = {
        relative: '',
        absolute: repoRoot,
        type: 'other' as const,
        directory: '',
        filename: '',
        extension: '',
      };
    } else {
      validated = validatePath(dirPath, repoRoot);
    }

    // Check if path exists and is a directory
    const targetPath = validated.absolute;
    if (!existsSync(targetPath)) {
      throw notFound(path || '');
    }

    const stats = await lstat(targetPath);
    if (!stats.isDirectory()) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Path "${path || ''}" is not a directory`,
          },
        ],
        isError: true,
      };
    }

    // List directory entries
    const entries = await listDirectoryRecursive(targetPath, repoRoot, validated.relative, {
      pattern,
      maxDepth: depth,
      currentDepth: 0,
      includeHidden,
    });

    // Format output
    const output: ListDocsOutput = {
      path: validated.relative || '',
      entries,
      total: entries.length,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(output, null, prettyPrint ? 2 : undefined),
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
      // Check for ENOENT (directory not found)
      if ('code' in error && error.code === 'ENOENT') {
        throw notFound(path || '');
      }

      return {
        content: [
          {
            type: 'text',
            text: `Error listing directory: ${error.message}`,
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
