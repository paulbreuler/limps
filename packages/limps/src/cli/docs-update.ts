/**
 * CLI command: update-doc
 * Update existing documents.
 */

import type { ServerConfig } from '../config.js';
import type { UpdateDocOutput, UpdateDocInput } from '../tools/update-doc.js';
import { handleUpdateDoc } from '../tools/update-doc.js';
import { initializeDatabase, createSchema } from '../indexer.js';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

/**
 * Options for updating documents.
 */
export interface UpdateDocOptions {
  path: string;
  content?: string;
  mode?: 'overwrite' | 'append' | 'prepend';
  patch?: {
    search: string;
    replace: string;
  };
  createBackup?: boolean;
  force?: boolean;
}

/**
 * Get document update result from the tool handler.
 * Returns structured data for rendering.
 *
 * @param config - Server configuration
 * @param options - Update options
 * @returns Update result or error message
 */
export async function getUpdateDocData(
  config: ServerConfig,
  options: UpdateDocOptions
): Promise<UpdateDocOutput | { error: string }> {
  try {
    // Ensure data directory exists
    mkdirSync(config.dataPath, { recursive: true });
    const dbPath = resolve(config.dataPath, 'documents.sqlite');
    const db = initializeDatabase(dbPath);
    createSchema(db);
    const input: UpdateDocInput = {
      path: options.path,
      content: options.content,
      mode: options.mode || 'overwrite',
      patch: options.patch ? { ...options.patch, all: false } : undefined,
      createBackup: options.createBackup ?? true,
      force: options.force || false,
      prettyPrint: true,
    };

    const result = await handleUpdateDoc(input, { config, db });

    if (result.isError) {
      const errorText = result.content[0]?.text || 'Unknown error';
      return { error: errorText };
    }

    const data = JSON.parse(result.content[0].text) as UpdateDocOutput;
    return data;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Update an existing document.
 *
 * @param config - Server configuration
 * @param options - Update options
 * @returns Formatted string output for CLI
 */
export async function updateDoc(config: ServerConfig, options: UpdateDocOptions): Promise<string> {
  const result = await getUpdateDocData(config, options);

  if ('error' in result) {
    return `Error: ${result.error}`;
  }

  const lines: string[] = [];
  lines.push('✓ Document updated successfully');
  lines.push('');
  lines.push(`Path: ${result.path}`);
  lines.push(`Size: ${(result.size / 1024).toFixed(1)} KB`);

  if (result.backup) {
    lines.push(`Backup: ${result.backup}`);
  }

  if (result.changes) {
    lines.push(`Changes: +${result.changes.additions} -${result.changes.deletions} lines`);
  }

  return lines.join('\n');
}
