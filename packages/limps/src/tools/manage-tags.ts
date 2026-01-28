/**
 * manage_tags tool: Add, remove, or list tags in documents.
 * Tags can be in frontmatter (tags: [...]) or inline (#tag).
 */

import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { validatePath } from '../utils/paths.js';
import { notFound } from '../utils/errors.js';
import { FrontmatterHandler } from '../utils/frontmatter.js';
import { indexDocument } from '../indexer.js';
import type { ToolContext, ToolResult } from '../types.js';

/**
 * Input schema for manage_tags tool.
 */
export const ManageTagsInputSchema = z.object({
  path: z.string().min(1).describe('Path to the document'),
  operation: z.enum(['add', 'remove', 'list']).describe('Operation: add, remove, or list tags'),
  tags: z
    .array(z.string())
    .optional()
    .describe('Array of tags (required for add and remove operations)'),
  prettyPrint: z
    .boolean()
    .default(false)
    .describe('Format JSON response with indentation (default: false)'),
});

export type ManageTagsInput = z.infer<typeof ManageTagsInputSchema>;

/**
 * Output interface for manage_tags tool.
 */
export interface ManageTagsOutput {
  path: string;
  operation: 'add' | 'remove' | 'list';
  tags: string[];
  success: boolean;
  message?: string;
}

/**
 * Get repository root from config.
 */
function getRepoRoot(config: { plansPath: string }): string {
  return dirname(config.plansPath);
}

/**
 * Extract tags from frontmatter and inline content.
 *
 * @param content - Document content
 * @param frontmatterHandler - Frontmatter handler instance
 * @returns Array of unique tags
 */
function extractAllTags(content: string, frontmatterHandler: FrontmatterHandler): string[] {
  const parsed = frontmatterHandler.parse(content);
  const tags: string[] = [];

  // Extract tags from frontmatter
  if (parsed.frontmatter.tags) {
    if (Array.isArray(parsed.frontmatter.tags)) {
      tags.push(...parsed.frontmatter.tags.map((t) => String(t)));
    } else if (typeof parsed.frontmatter.tags === 'string') {
      tags.push(parsed.frontmatter.tags);
    }
  }

  // Extract inline tags from content (#tag format)
  const inlineTagMatches = parsed.content.match(/#[a-zA-Z0-9_-]+/g) || [];
  const inlineTags = inlineTagMatches.map((tag) => tag.slice(1)); // Remove #
  tags.push(...inlineTags);

  // Deduplicate and return
  return Array.from(new Set(tags));
}

/**
 * Handle manage_tags tool request.
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result
 */
export async function handleManageTags(
  input: ManageTagsInput,
  context: ToolContext
): Promise<ToolResult> {
  const { path, operation, tags = [], prettyPrint } = input;
  const repoRoot = getRepoRoot(context.config);
  const frontmatterHandler = new FrontmatterHandler();

  try {
    // Validate path
    const validated = validatePath(path, repoRoot);

    // Check if file exists
    if (!existsSync(validated.absolute)) {
      throw notFound(path);
    }

    // Read current content
    const content = readFileSync(validated.absolute, 'utf-8');
    const parsed = frontmatterHandler.parse(content);

    // Extract current tags
    const currentTags = extractAllTags(content, frontmatterHandler);

    if (operation === 'list') {
      const output: ManageTagsOutput = {
        path: validated.relative,
        operation: 'list',
        tags: currentTags,
        success: true,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(output, null, prettyPrint ? 2 : undefined),
          },
        ],
      };
    }

    // For add/remove operations, tags are required
    if (tags.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                path: validated.relative,
                operation,
                tags: currentTags,
                success: false,
                message: 'Tags array is required for add and remove operations',
              },
              null,
              prettyPrint ? 2 : undefined
            ),
          },
        ],
        isError: true,
      };
    }

    let newTags = [...currentTags];

    if (operation === 'add') {
      // Add tags that don't already exist
      for (const tag of tags) {
        if (!newTags.includes(tag)) {
          newTags.push(tag);
        }
      }
    } else if (operation === 'remove') {
      // Remove specified tags
      newTags = newTags.filter((tag) => !tags.includes(tag));
    }

    // Update frontmatter with new tags
    const updatedFrontmatter: Record<string, unknown> = {
      ...parsed.frontmatter,
    };

    if (newTags.length > 0) {
      updatedFrontmatter.tags = newTags;
    } else if ('tags' in updatedFrontmatter) {
      // Remove tags key if no tags remain
      delete updatedFrontmatter.tags;
    }

    // Validate updated frontmatter
    const validation = frontmatterHandler.validate(updatedFrontmatter);
    if (!validation.isValid) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                path: validated.relative,
                operation,
                tags: currentTags,
                success: false,
                message: `Invalid frontmatter: ${validation.errors.join(', ')}`,
              },
              null,
              prettyPrint ? 2 : undefined
            ),
          },
        ],
        isError: true,
      };
    }

    // Write back the note with updated frontmatter
    const updatedContent = frontmatterHandler.stringify(updatedFrontmatter, parsed.content);
    writeFileSync(validated.absolute, updatedContent, 'utf-8');

    // Re-index the document
    await indexDocument(context.db, validated.absolute);

    const output: ManageTagsOutput = {
      path: validated.relative,
      operation,
      tags: newTags,
      success: true,
      message: `Successfully ${operation === 'add' ? 'added' : 'removed'} tags`,
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
    if (error && typeof error === 'object' && 'code' in error && error.code === 'DOCUMENT_ERROR') {
      throw error;
    }

    // Wrap other errors
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              path,
              operation,
              tags: [],
              success: false,
              message: error instanceof Error ? error.message : 'Unknown error',
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
