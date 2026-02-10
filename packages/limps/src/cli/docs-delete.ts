/**
 * CLI command: delete-doc
 * Delete documents with confirmation and backup.
 */

import type { ServerConfig } from '../config.js';
import type { DeleteDocOutput, DeleteDocInput } from '../tools/delete-doc.js';
import { handleDeleteDoc } from '../tools/delete-doc.js';
import { initializeDatabase, createSchema } from '../indexer.js';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

/**
 * Options for deleting documents.
 */
export interface DeleteDocOptions {
  path: string;
  confirm?: boolean;
  permanent?: boolean;
}

/**
 * Get document deletion result from the tool handler.
 * Returns structured data for rendering.
 *
 * @param config - Server configuration
 * @param options - Deletion options
 * @returns Deletion result or error message
 */
export async function getDeleteDocData(
  config: ServerConfig,
  options: DeleteDocOptions
): Promise<DeleteDocOutput | { error: string }> {
  // Ensure data directory exists
  mkdirSync(config.dataPath, { recursive: true });
  const dbPath = resolve(config.dataPath, 'documents.sqlite');
  const db = initializeDatabase(dbPath);

  try {
    createSchema(db);
    const input: DeleteDocInput = {
      path: options.path,
      confirm: options.confirm || false,
      permanent: options.permanent || false,
    };

    const result = await handleDeleteDoc(input, { config, db });

    if (result.isError) {
      const errorText = result.content[0]?.text || 'Unknown error';
      return { error: errorText };
    }

    const data = JSON.parse(result.content[0].text) as DeleteDocOutput;
    return data;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    db.close();
  }
}

/**
 * Delete a document.
 *
 * @param config - Server configuration
 * @param options - Deletion options
 * @returns Formatted string output for CLI
 */
export async function deleteDoc(config: ServerConfig, options: DeleteDocOptions): Promise<string> {
  const result = await getDeleteDocData(config, options);

  if ('error' in result) {
    return `Error: ${result.error}`;
  }

  const lines: string[] = [];

  if (result.pending) {
    lines.push('⚠️  Deletion pending confirmation');
    lines.push('');
    lines.push(`Path: ${result.path}`);
    if (result.preview) {
      lines.push('');
      lines.push('Preview:');
      lines.push(result.preview);
    }
    lines.push('');
    lines.push('Run with --confirm to proceed');
  } else if (result.deleted) {
    lines.push('✓ Document deleted successfully');
    lines.push('');
    lines.push(`Path: ${result.path}`);

    if (result.trash) {
      lines.push(`Moved to trash: ${result.trash}`);
    }

    if (result.backup) {
      lines.push(`Backup: ${result.backup}`);
    }
  }

  return lines.join('\n');
}
