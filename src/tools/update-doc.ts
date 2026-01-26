/**
 * update_doc tool: Update existing documents with full replacement or patch operations.
 */

import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { dirname } from 'path';
import { validatePath, isProtectedPlanFile } from '../utils/paths.js';
import { notFound, permissionDenied, noSpaceError } from '../utils/errors.js';
import { createBackup } from '../utils/backup.js';
import { FrontmatterHandler } from '../utils/frontmatter.js';
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
  content: z
    .string()
    .optional()
    .describe('Content to write (required for overwrite/append/prepend modes)'),
  patch: PatchSchema.optional().describe('Search/replace patch'),
  mode: z
    .enum(['overwrite', 'append', 'prepend'])
    .default('overwrite')
    .describe('Write mode: overwrite (default), append, or prepend'),
  createBackup: z.boolean().default(true).describe('Create backup before update'),
  force: z.boolean().default(false).describe('Skip validation warnings'),
  prettyPrint: z
    .boolean()
    .default(false)
    .describe('Format JSON response with indentation (default: false)'),
});

/**
 * Input schema for update_doc tool (with validation).
 */
export const UpdateDocInputSchema = UpdateDocInputBaseSchema.refine(
  (data) => {
    // For append/prepend modes, content is required
    if ((data.mode === 'append' || data.mode === 'prepend') && data.content === undefined) {
      return false;
    }
    // For overwrite mode or patch, either content or patch must be provided
    return data.content !== undefined || data.patch !== undefined;
  },
  {
    message:
      'Content is required for append/prepend modes. For overwrite mode, either content or patch must be provided.',
  }
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
  const {
    path,
    content,
    patch,
    mode = 'overwrite',
    createBackup: shouldBackup,
    force,
    prettyPrint,
  } = input;
  const repoRoot = getRepoRoot(context.config);
  const frontmatterHandler = new FrontmatterHandler();

  try {
    // Validate path
    const validated = validatePath(path, repoRoot);

    // Check if file exists (required for append/prepend modes)
    const fileExists = existsSync(validated.absolute);
    if (!fileExists && (mode === 'append' || mode === 'prepend')) {
      throw notFound(path);
    }

    if (!fileExists && mode === 'overwrite' && patch === undefined) {
      throw notFound(path);
    }

    // Check if this is a protected plan file
    if (fileExists && isProtectedPlanFile(validated.relative) && !force) {
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
              prettyPrint ? 2 : undefined
            ),
          },
        ],
        isError: true,
      };
    }

    // Read existing content if file exists
    const oldContent = fileExists ? readFileSync(validated.absolute, 'utf-8') : '';
    const hadFrontmatter = hasFrontmatter(oldContent);

    // Determine new content
    let newContent: string;
    if (content !== undefined) {
      if (mode === 'overwrite') {
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
                  prettyPrint ? 2 : undefined
                ),
              },
            ],
            isError: true,
          };
        }
      } else if (mode === 'append' || mode === 'prepend') {
        // Append or prepend mode - merge frontmatter and content
        if (!fileExists) {
          // File doesn't exist, treat as overwrite
          newContent = content;
        } else {
          // Parse existing note
          const existingNote = frontmatterHandler.parse(oldContent);
          const newNote = frontmatterHandler.parse(content);

          // Merge frontmatter
          const mergedFrontmatter = {
            ...existingNote.frontmatter,
            ...newNote.frontmatter,
          };

          // Combine content based on mode
          let combinedContent: string;
          if (mode === 'append') {
            combinedContent = existingNote.content + newNote.content;
          } else {
            // prepend
            combinedContent = newNote.content + existingNote.content;
          }

          // Validate merged frontmatter
          const validation = frontmatterHandler.validate(mergedFrontmatter);
          if (!validation.isValid) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      error: `Invalid frontmatter after merge: ${validation.errors.join(', ')}`,
                      path: validated.relative,
                    },
                    null,
                    prettyPrint ? 2 : undefined
                  ),
                },
              ],
              isError: true,
            };
          }

          // Stringify with merged frontmatter and combined content
          newContent = frontmatterHandler.stringify(mergedFrontmatter, combinedContent);
        }
      } else {
        // This should never happen due to schema validation
        throw new Error(`Invalid mode: ${mode}`);
      }
    } else if (patch !== undefined) {
      // Patch operation (only works with overwrite mode)
      if (mode !== 'overwrite') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: 'Patch operations only work with overwrite mode',
                  path: validated.relative,
                },
                null,
                prettyPrint ? 2 : undefined
              ),
            },
          ],
          isError: true,
        };
      }

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
                prettyPrint ? 2 : undefined
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

    // Write new content with error handling
    try {
      writeFileSync(validated.absolute, newContent, 'utf-8');
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        if (error.code === 'EACCES' || error.code === 'EPERM') {
          throw permissionDenied(validated.relative, undefined, 'write');
        }
        if (error.code === 'ENOSPC') {
          throw noSpaceError(validated.relative);
        }
      }
      throw error;
    }

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
          text: JSON.stringify(output, null, prettyPrint ? 2 : undefined),
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
            prettyPrint ? 2 : undefined
          ),
        },
      ],
      isError: true,
    };
  }
}
