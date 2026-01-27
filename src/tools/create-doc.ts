/**
 * create_doc tool: Create new documents with optional template frontmatter.
 */

import { z } from 'zod';
import { existsSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { dirname } from 'path';
import { validatePath, isWritablePath, type DocType } from '../utils/paths.js';
import { alreadyExists, restrictedPath, permissionDenied, noSpaceError } from '../utils/errors.js';
import { indexDocument } from '../indexer.js';
import type { ToolContext, ToolResult } from '../types.js';

/**
 * Input schema for create_doc tool.
 */
export const CreateDocInputSchema = z.object({
  path: z.string().min(1).describe('Path for new file relative to repo root'),
  content: z.string().describe('File content'),
  template: z
    .enum(['addendum', 'research', 'example', 'none'])
    .default('none')
    .describe('Template to apply (adds frontmatter)'),
  prettyPrint: z
    .boolean()
    .default(false)
    .describe('Format JSON response with indentation (default: false)'),
});

export type CreateDocInput = z.infer<typeof CreateDocInputSchema>;

/**
 * Output interface for create_doc tool.
 */
export interface CreateDocOutput {
  path: string;
  created: true;
  size: number;
  type: DocType;
}

/**
 * Template definitions with frontmatter.
 * {{DATE}} placeholder is replaced with current date in YYYY-MM-DD format.
 */
export const TEMPLATES: Record<string, string> = {
  addendum: `---
version: "1.0"
date: "{{DATE}}"
status: "Draft"
type: "addendum"
extends: ""
author: ""
---

`,
  research: `---
version: "1.0"
date: "{{DATE}}"
status: "Draft"
type: "research"
---

`,
  example: '',
  none: '',
};

/**
 * Get repository root from config.
 * Assumes plansPath is ../plans relative to .mcp, so dirname gives repo root.
 */
function getRepoRoot(config: { plansPath: string }): string {
  return dirname(config.plansPath);
}

/**
 * Apply template to content, replacing {{DATE}} with current date.
 */
function applyTemplate(template: string, content: string): string {
  const date = new Date().toISOString().split('T')[0];
  const templateContent = template.replace(/\{\{DATE\}\}/g, date);
  return templateContent + content;
}

/**
 * Handle create_doc tool request.
 * Creates a new file with optional template frontmatter.
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result
 */
export async function handleCreateDoc(
  input: CreateDocInput,
  context: ToolContext
): Promise<ToolResult> {
  const { path, content, template, prettyPrint = false } = input;
  const repoRoot = getRepoRoot(context.config);

  try {
    // Validate path (must not exist, must be writable)
    const validated = validatePath(path, repoRoot, {
      requireWritable: true,
    });

    // Check if file already exists
    if (existsSync(validated.absolute)) {
      throw alreadyExists(path);
    }

    // Check if path is writable (additional check beyond requireWritable)
    if (!isWritablePath(validated.relative)) {
      throw restrictedPath(path);
    }

    // Apply template if specified
    let finalContent = content;
    if (template !== 'none' && TEMPLATES[template]) {
      finalContent = applyTemplate(TEMPLATES[template], content);
    }

    // Create parent directories if needed
    const parentDir = dirname(validated.absolute);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    // Write file with error handling
    try {
      writeFileSync(validated.absolute, finalContent, 'utf-8');
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

    // Index the new file
    await indexDocument(context.db, validated.absolute);

    const output: CreateDocOutput = {
      path: validated.relative,
      created: true,
      size,
      type: validated.type,
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
