/**
 * update_doc tool: Update existing documents with full replacement or patch operations.
 */

import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { dirname } from 'path';
import { validatePath, isProtectedPlanFile } from '../utils/paths.js';
import { notFound } from '../utils/errors.js';
import { createBackup } from '../utils/backup.js';
import { indexDocument } from '../indexer.js';
import type { ToolContext, ToolResult } from '../types.js';

/**
 * Patch operation schema.
 */
export const PatchSchema = z.object({
  search: z.string().min(1).describe('Text to find'),
  replace: z.string().describe('Replacement text'),
  all: z.boolean().default(false).describe('Replace all occurrences'),
});

/**
 * Base input schema for update_doc tool (for registration).
 */
export const UpdateDocInputBaseSchema = z.object({
  path: z.string().min(1).describe('Path to existing file'),
  content: z.string().optional().describe('Full replacement content'),
  patch: PatchSchema.optional().describe('Search/replace patch'),
  createBackup: z.boolean().default(true).describe('Create backup before update'),
  force: z.boolean().default(false).describe('Skip validation warnings'),
});

/**
 * Input schema for update_doc tool (with validation).
 */
export const UpdateDocInputSchema = UpdateDocInputBaseSchema.refine(
  (data) => data.content !== undefined || data.patch !== undefined,
  { message: 'Either content or patch must be provided' }
);

export type UpdateDocInput = z.infer<typeof UpdateDocInputSchema>;

/**
 * Output interface for update_doc tool.
 */
export interface UpdateDocOutput {
  path: string;
  updated: true;
  size: number;
  backup?: string;
  changes?: {
    additions: number;
    deletions: number;
  };
}

/**
 * Get repository root from config.
 */
function getRepoRoot(config: { plansPath: string }): string {
  return dirname(config.plansPath);
}

/**
 * Check if content has frontmatter (YAML or TOML).
 */
function hasFrontmatter(content: string): boolean {
  return /^---\s*\n/.test(content) || /^\+\+\+\s*\n/.test(content);
}

/**
 * Calculate line count differences between old and new content.
 */
function calculateChanges(
  oldContent: string,
  newContent: string
): {
  additions: number;
  deletions: number;
} {
  const oldLines = oldContent.split('\n').length;
  const newLines = newContent.split('\n').length;
  const additions = Math.max(0, newLines - oldLines);
  const deletions = Math.max(0, oldLines - newLines);
  return { additions, deletions };
}

/**
 * Apply patch operation to content.
 */
function applyPatch(
  content: string,
  patch: { search: string; replace: string; all: boolean }
): string {
  if (patch.all) {
    return content.replaceAll(patch.search, patch.replace);
  }
  return content.replace(patch.search, patch.replace);
}

/**
 * Handle update_doc tool request.
 * Updates an existing file with full replacement or patch operation.
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result
 */
export async function handleUpdateDoc(
  input: UpdateDocInput,
  context: ToolContext
): Promise<ToolResult> {
  const { path, content, patch, createBackup: shouldBackup, force } = input;
  const repoRoot = getRepoRoot(context.config);

  try {
    // Validate path
    const validated = validatePath(path, repoRoot);

    // Check if file exists
    if (!existsSync(validated.absolute)) {
      throw notFound(path);
    }

    // Check if this is a protected plan file
    if (isProtectedPlanFile(validated.relative) && !force) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                warning: 'Protected plan file - confirm with force: true',
                path: validated.relative,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    // Read existing content
    const oldContent = readFileSync(validated.absolute, 'utf-8');
    const hadFrontmatter = hasFrontmatter(oldContent);

    // Determine new content
    let newContent: string;
    if (content !== undefined) {
      // Full replacement
      newContent = content;

      // Warn if frontmatter was removed (unless force is true)
      if (hadFrontmatter && !hasFrontmatter(newContent) && !force) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  warning: 'Frontmatter removed - confirm with force: true',
                  path: validated.relative,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    } else if (patch !== undefined) {
      // Patch operation
      newContent = applyPatch(oldContent, patch);

      // Warn if patch had no matches
      if (newContent === oldContent) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  warning: 'Patch had no matches - file unchanged',
                  path: validated.relative,
                  search: patch.search,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    } else {
      // This should never happen due to schema validation
      throw new Error('Either content or patch must be provided');
    }

    // Create backup if requested
    let backupPath: string | undefined;
    if (shouldBackup) {
      const backupResult = await createBackup(validated.absolute, repoRoot);
      backupPath = backupResult.backupPath;
    }

    // Write new content
    writeFileSync(validated.absolute, newContent, 'utf-8');

    // Get file size
    const stats = statSync(validated.absolute);
    const size = stats.size;

    // Calculate changes
    const changes = calculateChanges(oldContent, newContent);

    // Re-index the file
    await indexDocument(context.db, validated.absolute);

    const output: UpdateDocOutput = {
      path: validated.relative,
      updated: true,
      size,
      backup: backupPath,
      changes,
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
    // Re-throw DocumentError as-is
    if (error instanceof Error && 'code' in error) {
      throw error;
    }

    // Wrap other errors
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : String(error),
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}
