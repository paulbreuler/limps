/**
 * CLI command: search-docs
 * Full-text search across planning documents.
 */

import type { ServerConfig } from '../config.js';
import type { SearchResult } from '../tools/search-docs.js';
import { handleSearchDocs } from '../tools/search-docs.js';
import { initializeDatabase, createSchema } from '../indexer.js';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

/**
 * Options for searching documents.
 */
export interface SearchDocsOptions {
  query: string;
  limit?: number;
  searchFrontmatter?: boolean;
  caseSensitive?: boolean;
}

/**
 * Get search results data from the tool handler.
 * Returns structured data for rendering.
 *
 * @param config - Server configuration
 * @param options - Search options
 * @returns Search results or error message
 */
export async function getSearchDocsData(
  config: ServerConfig,
  options: SearchDocsOptions
): Promise<SearchResult[] | { error: string }> {
  // Ensure data directory exists
  mkdirSync(config.dataPath, { recursive: true });
  const dbPath = resolve(config.dataPath, 'documents.sqlite');
  const db = initializeDatabase(dbPath);

  try {
    createSchema(db);
    const result = await handleSearchDocs(
      {
        query: options.query,
        limit: options.limit || 20,
        searchContent: true,
        searchFrontmatter: options.searchFrontmatter || false,
        caseSensitive: options.caseSensitive || false,
        prettyPrint: true,
      },
      { config, db }
    );

    if (result.isError) {
      const errorText = result.content[0]?.text || 'Unknown error';
      return { error: errorText };
    }

    const text = result.content[0].text;

    // Handle "no results" message
    if (text.includes('No results found')) {
      return [];
    }

    const data = JSON.parse(text) as SearchResult[];
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
 * Format search result for CLI display.
 */
function formatResult(result: SearchResult, index: number): string[] {
  const lines: string[] = [];
  const title = result.title || result.t;
  const path = result.path || result.p;
  const excerpt = result.excerpt || result.ex;
  const matchCount = result.matchCount ?? result.mc;
  const lineNumber = result.lineNumber ?? result.ln;

  lines.push(`${index + 1}. ${title}`);
  lines.push(`   Path: ${path}`);
  lines.push(`   Matches: ${matchCount} | Line: ${lineNumber}`);
  lines.push(`   ${excerpt}`);

  return lines;
}

/**
 * Search documents using full-text search.
 *
 * @param config - Server configuration
 * @param options - Search options
 * @returns Formatted string output for CLI
 */
export async function searchDocs(
  config: ServerConfig,
  options: SearchDocsOptions
): Promise<string> {
  const result = await getSearchDocsData(config, options);

  if ('error' in result) {
    return `Error: ${result.error}`;
  }

  const lines: string[] = [];
  lines.push(`Search results for: "${options.query}"`);
  lines.push('');

  if (result.length === 0) {
    lines.push('No results found');
  } else {
    for (let i = 0; i < result.length; i++) {
      lines.push(...formatResult(result[i], i));
      if (i < result.length - 1) {
        lines.push('');
      }
    }
    lines.push('');
    lines.push(`Total: ${result.length} result(s)`);
  }

  return lines.join('\n');
}
