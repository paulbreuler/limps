/**
 * CLI command: create-doc
 * Create new documents with optional template.
 */

import type { ServerConfig } from '../config.js';
import type { CreateDocOutput, CreateDocInput } from '../tools/create-doc.js';
import { handleCreateDoc } from '../tools/create-doc.js';
import { initializeDatabase, createSchema } from '../indexer.js';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

/**
 * Options for creating documents.
 */
export interface CreateDocOptions {
  path: string;
  content: string;
  template?: 'addendum' | 'research' | 'example' | 'none';
}

/**
 * Get document creation result from the tool handler.
 * Returns structured data for rendering.
 *
 * @param config - Server configuration
 * @param options - Creation options
 * @returns Creation result or error message
 */
export async function getCreateDocData(
  config: ServerConfig,
  options: CreateDocOptions
): Promise<CreateDocOutput | { error: string }> {
  try {
    // Ensure data directory exists
    mkdirSync(config.dataPath, { recursive: true });
    const dbPath = resolve(config.dataPath, 'documents.sqlite');
    const db = initializeDatabase(dbPath);
    createSchema(db);
    const input: CreateDocInput = {
      path: options.path,
      content: options.content,
      template: options.template || 'none',
      prettyPrint: true,
    };

    const result = await handleCreateDoc(input, { config, db });

    if (result.isError) {
      const errorText = result.content[0]?.text || 'Unknown error';
      return { error: errorText };
    }

    const data = JSON.parse(result.content[0].text) as CreateDocOutput;
    return data;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Create a new document.
 *
 * @param config - Server configuration
 * @param options - Creation options
 * @returns Formatted string output for CLI
 */
export async function createDoc(config: ServerConfig, options: CreateDocOptions): Promise<string> {
  const result = await getCreateDocData(config, options);

  if ('error' in result) {
    return `Error: ${result.error}`;
  }

  const lines: string[] = [];
  lines.push('✓ Document created successfully');
  lines.push('');
  lines.push(`Path: ${result.path}`);
  lines.push(`Size: ${(result.size / 1024).toFixed(1)} KB`);
  lines.push(`Type: ${result.type}`);

  if (options.template && options.template !== 'none') {
    lines.push(`Template: ${options.template}`);
  }

  return lines.join('\n');
}
