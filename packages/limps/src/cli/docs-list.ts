/**
 * CLI command: list-docs
 * Lists files and directories with optional filtering.
 */

import type { ServerConfig } from '../config.js';
import type { ListDocsOutput, DirEntry } from '../tools/list-docs.js';
import { handleListDocs } from '../tools/list-docs.js';
import { initializeDatabase, createSchema } from '../indexer.js';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

/**
 * Options for listing documents.
 */
export interface ListDocsOptions {
  path?: string;
  pattern?: string;
  depth?: number;
  includeHidden?: boolean;
}

/**
 * Get documents list data from the tool handler.
 * Returns structured data for rendering.
 *
 * @param config - Server configuration
 * @param options - Listing options
 * @returns List data or error message
 */
export async function getDocsListData(
  config: ServerConfig,
  options: ListDocsOptions = {}
): Promise<ListDocsOutput | { error: string }> {
  try {
    // Ensure data directory exists
    mkdirSync(config.dataPath, { recursive: true });
    const dbPath = resolve(config.dataPath, 'documents.sqlite');
    const db = initializeDatabase(dbPath);
    createSchema(db);
    const result = await handleListDocs(
      {
        path: options.path || '',
        pattern: options.pattern,
        depth: options.depth || 2,
        includeHidden: options.includeHidden || false,
        prettyPrint: true,
      },
      { config, db }
    );

    if (result.isError) {
      const errorText = result.content[0]?.text || 'Unknown error';
      return { error: errorText };
    }

    const data = JSON.parse(result.content[0].text) as ListDocsOutput;
    return data;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Format directory entry for CLI display.
 */
function formatEntry(entry: DirEntry, indent = 0): string {
  const prefix = '  '.repeat(indent);
  const icon = entry.type === 'directory' ? '📁' : '📄';

  let line = `${prefix}${icon} ${entry.name}`;

  if (entry.type === 'file' && entry.size !== undefined) {
    const sizeKb = (entry.size / 1024).toFixed(1);
    line += ` (${sizeKb} KB)`;
  } else if (entry.type === 'directory' && entry.children !== undefined) {
    line += ` (${entry.children} items)`;
  }

  return line;
}

/**
 * List documents from the configured paths.
 *
 * @param config - Server configuration
 * @param options - Listing options
 * @returns Formatted string output for CLI
 */
export async function listDocs(
  config: ServerConfig,
  options: ListDocsOptions = {}
): Promise<string> {
  const result = await getDocsListData(config, options);

  if ('error' in result) {
    return `Error: ${result.error}`;
  }

  const lines: string[] = [];
  const displayPath = result.path || '(root)';
  lines.push(`Documents in: ${displayPath}`);
  lines.push('');

  if (result.entries.length === 0) {
    lines.push('No files found');
  } else {
    for (const entry of result.entries) {
      lines.push(formatEntry(entry));
    }
    lines.push('');
    lines.push(`Total: ${result.total} item(s)`);
  }

  return lines.join('\n');
}
