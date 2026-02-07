/**
 * delete_doc tool - Delete documents with confirmation flow, soft delete to trash, and backup.
 */

import { z } from 'zod';
import { existsSync, readFileSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { join, dirname, basename, relative } from 'path';
import type { ToolContext, ToolResult } from '../types.js';
import { validatePath, isWritablePath, isProtectedPlanFile } from '../utils/paths.js';
import { createBackup, formatTimestamp } from '../utils/backup.js';
import { notFound, restrictedPath, DocumentError } from '../utils/errors.js';
import { removeDocument } from '../indexer.js';
import { getDocsRoot } from '../utils/repo-root.js';

/**
 * Trash directory name (relative to repo root).
 */
export const TRASH_DIR = '.trash';

/**
 * Protected files that cannot be deleted.
 */
export const PROTECTED_FILES: readonly string[] = [
  'VISION.md',
  'RUNI-DESIGN-VISION.md',
  'DESIGN_IDEOLOGY.md',
  'MANIFEST.md',
  'CLAUDE.md',
  'README.md',
];

/**
 * Input schema for delete_doc tool.
 */
export const DeleteDocInputSchema = z.object({
  path: z.string().min(1, 'Path is required'),
  confirm: z.boolean().optional().default(false),
  permanent: z.boolean().optional().default(false),
});

export type DeleteDocInput = z.infer<typeof DeleteDocInputSchema>;

/**
 * Output interface for delete_doc tool.
 */
export interface DeleteDocOutput {
  path: string;
  deleted?: boolean;
  pending?: boolean;
  preview?: string;
  trash?: string;
  backup?: string;
}

/**
 * Get the trash path for a file.
 */
function getTrashPath(filePath: string, repoRoot: string): string {
  const relativePath = relative(repoRoot, filePath);
  const timestamp = formatTimestamp(new Date());
  const trashFilename = `${basename(relativePath)}.deleted-${timestamp}`;
  const trashDir = join(repoRoot, TRASH_DIR, dirname(relativePath));

  return join(trashDir, trashFilename);
}

/**
 * Check if a file is protected from deletion.
 * Only protects canonical root-level files, not files with the same name in subdirectories.
 */
function isProtectedFile(relativePath: string): boolean {
  const filename = basename(relativePath);
  // Only protect if it's a root-level file (no directory in path)
  const dir = dirname(relativePath);
  if (dir !== '.' && dir !== '') {
    return false;
  }
  return PROTECTED_FILES.includes(filename);
}

/**
 * Handle delete_doc tool request.
 * Deletes documents with confirmation flow, soft delete to trash, and backup.
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result
 */
export async function handleDeleteDoc(
  input: DeleteDocInput,
  context: ToolContext
): Promise<ToolResult> {
  const { path: inputPath, confirm, permanent } = input;
  const repoRoot = getDocsRoot(context.config);

  try {
    // Validate the path
    const validated = validatePath(inputPath, repoRoot);
    const absolutePath = validated.absolute;
    const { db } = context;

    // Check if file exists
    if (!existsSync(absolutePath)) {
      throw notFound(inputPath);
    }

    // Check if file is protected (canonical files or protected plan files)
    if (isProtectedFile(validated.relative) || isProtectedPlanFile(validated.relative)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: `Cannot delete protected file: ${inputPath}`,
              code: 'PROTECTED_FILE',
            }),
          },
        ],
        isError: true,
      };
    }

    // Check if path is writable (in allowed directories)
    if (!isWritablePath(validated.relative)) {
      throw restrictedPath(inputPath);
    }

    // If no confirmation, return pending status with preview
    if (!confirm) {
      const content = readFileSync(absolutePath, 'utf-8');
      const preview = content.length > 500 ? content.substring(0, 500) + '...' : content;

      const output: DeleteDocOutput = {
        path: inputPath,
        pending: true,
        preview,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(output),
          },
        ],
      };
    }

    // Create backup before deletion
    const backupResult = await createBackup(absolutePath, repoRoot);

    // Remove from search index
    await removeDocument(db, absolutePath);

    // Perform deletion
    if (permanent) {
      // Permanent delete - just unlink the file
      unlinkSync(absolutePath);

      const output: DeleteDocOutput = {
        path: inputPath,
        deleted: true,
        backup: backupResult.backupPath,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(output),
          },
        ],
      };
    } else {
      // Soft delete - move to trash
      const trashPath = getTrashPath(absolutePath, repoRoot);
      const trashDir = dirname(trashPath);

      // Ensure trash directory exists
      mkdirSync(trashDir, { recursive: true });

      // Move file to trash
      renameSync(absolutePath, trashPath);

      const output: DeleteDocOutput = {
        path: inputPath,
        deleted: true,
        trash: trashPath,
        backup: backupResult.backupPath,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(output),
          },
        ],
      };
    }
  } catch (error) {
    if (error instanceof DocumentError) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(error.toJSON()),
          },
        ],
        isError: true,
      };
    }

    // Handle unexpected errors
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: message,
            code: 'INTERNAL_ERROR',
          }),
        },
      ],
      isError: true,
    };
  }
}
