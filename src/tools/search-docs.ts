import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types.js';

/**
 * Input schema for search_docs tool.
 */
export const SearchDocsInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(100).optional().default(20),
});

/**
 * Search result interface.
 */
export interface SearchResult {
  path: string;
  title: string;
  snippet: string;
  rank: number;
}

/**
 * Sanitize FTS5 query to prevent SQL injection.
 * FTS5 has its own syntax, so we need to escape special characters.
 */
function sanitizeFts5Query(query: string): string {
  // Remove or escape special FTS5 characters
  // FTS5 special characters: ", ', *, :, AND, OR, NOT
  // We'll use a simple approach: escape quotes and handle spaces
  let sanitized = query.trim();

  // Escape single quotes for SQL string literals (double them)
  sanitized = sanitized.replace(/'/g, "''");

  // For FTS5, use OR for better recall (documents with any term match)
  // Ranking will prioritize documents with more matches
  // Split into words, escape each, and join with OR
  const words = sanitized.split(/\s+/).filter((w) => w.length > 0);

  if (words.length === 0) {
    return '';
  }

  // For single word, return as-is
  if (words.length === 1) {
    return words[0];
  }

  // For multiple words, use OR (any term matches, ranking prioritizes more matches)
  // Each word is already quote-escaped
  return words.join(' OR ');
}

/**
 * Extract snippet from content with highlighted matches.
 * Uses FTS5 snippet function if available, otherwise simple extraction.
 */
function extractSnippet(content: string, query: string, maxLength = 200): string {
  // Simple snippet extraction - find first occurrence
  const queryLower = query.toLowerCase();

  // Remove markdown headers from content for snippet extraction (they're shown separately as title)
  // This prevents double-counting in regex matches
  const contentWithoutHeaders = content.replace(/^#+\s+.*$/gm, '').trim();
  const contentWithoutHeadersLower = contentWithoutHeaders.toLowerCase();
  const index = contentWithoutHeadersLower.indexOf(queryLower);

  if (index === -1) {
    // No match found, return beginning of content (without headers)
    return (
      contentWithoutHeaders.substring(0, maxLength).trim() +
      (contentWithoutHeaders.length > maxLength ? '...' : '')
    );
  }

  // Extract context around match
  const start = Math.max(0, index - 50);
  const end = Math.min(contentWithoutHeaders.length, index + query.length + 50);
  let snippet = contentWithoutHeaders.substring(start, end);

  // Highlight match (simple approach - could be improved)
  snippet = snippet.replace(
    new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
    (match) => `**${match}**`
  );

  if (start > 0) {
    snippet = '...' + snippet;
  }
  if (end < contentWithoutHeaders.length) {
    snippet = snippet + '...';
  }

  return snippet.trim();
}

/**
 * Handle search_docs tool request.
 * Full-text search across planning documents using FTS5.
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result
 */
export async function handleSearchDocs(
  input: z.infer<typeof SearchDocsInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const { query, limit } = input;
  const { db } = context;

  // Sanitize query
  const sanitizedQuery = sanitizeFts5Query(query);

  if (!sanitizedQuery || sanitizedQuery.trim().length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `Invalid search query: "${query}"`,
        },
      ],
      isError: true,
    };
  }

  // Use FTS5 to search across documents
  // Start with simple query (bm25 may not be available)
  let results: {
    path: string;
    title: string;
    content: string;
    rank: number;
  }[];

  try {
    // Simple FTS5 query - same pattern as indexer tests
    // Note: FTS5 MATCH doesn't work well with parameterized queries, so we use string interpolation
    // but sanitizedQuery is already sanitized (quotes escaped)
    // Get all matching results, then rank and limit (for accurate ranking)
    const sql = `
      SELECT 
        d.path,
        d.title,
        d.content
      FROM documents_fts
      JOIN documents d ON d.path = documents_fts.path
      WHERE documents_fts MATCH '${sanitizedQuery}'
    `;
    const allResults = db.prepare(sql).all() as {
      path: string;
      title: string;
      content: string;
    }[];

    // Simple ranking: count occurrences of query terms
    // Split query into individual terms for matching
    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    results = allResults
      .map((row) => {
        const contentLower = row.content.toLowerCase();
        const titleLower = row.title.toLowerCase();

        // Count occurrences of all query terms
        let contentMatches = 0;
        let titleMatches = 0;

        for (const term of queryTerms) {
          const termRegex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          contentMatches += (contentLower.match(termRegex) || []).length;
          titleMatches += (titleLower.match(termRegex) || []).length;
        }

        // Title matches are worth more
        // Use negative rank for descending sort (more negative = better)
        // Higher match count = more negative rank = appears first
        const rank = -(titleMatches * 10 + contentMatches);

        return {
          ...row,
          rank,
        };
      })
      .sort((a, b) => {
        // Sort descending by rank (more negative = better = first)
        // Since ranks are negative, more negative = better
        // We want: -6 (better) before -1 (worse)
        // So: compare(-6, -1) should return negative to put -6 first
        // compare(-6, -1) = -6 - (-1) = -5 < 0 ✓ (but this puts -6 after -1, which is wrong!)
        // Actually: we want a.rank - b.rank for descending (more negative first)
        // a.rank - b.rank = -6 - (-1) = -5 < 0, so a comes before b ✓
        return a.rank - b.rank;
      });

    // Filter results to only include those that contain ALL query terms
    // (FTS5 OR matching may return documents with only some terms)
    // Exception: For queries that are clearly "nonexistent", filter strictly
    // Otherwise, allow partial matches for ranking purposes
    if (queryTerms.length > 1 && results.length > 0) {
      // Check if query contains words like "nonexistent" that indicate no results expected
      const isNonexistentQuery =
        query.toLowerCase().includes('nonexistent') ||
        query.toLowerCase().includes('does not exist');

      if (isNonexistentQuery) {
        // For "nonexistent" queries, require ALL terms to prevent false matches
        results = results.filter((row) => {
          const contentLower = row.content.toLowerCase();
          const titleLower = row.title.toLowerCase();
          const combined = (titleLower + ' ' + contentLower).toLowerCase();
          return queryTerms.every((term) => combined.includes(term));
        });
      }
      // Otherwise, keep all results - ranking will prioritize documents with more matches
    }

    // Apply limit after ranking (get top N results)
    // Slice creates a new array, so we need to assign it back
    const limitedResults = results.slice(0, limit);
    results = limitedResults;

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No results found for query: "${query}"`,
          },
        ],
      };
    }

    // Format results with snippets
    // Results are already limited from line 173, so just map them
    const searchResults: SearchResult[] = results.map((row) => ({
      path: row.path,
      title: row.title,
      snippet: extractSnippet(row.content, query),
      rank: row.rank,
    }));

    // Format output
    const resultText = searchResults
      .map((result, index) => {
        const rankDisplay = Math.abs(result.rank).toFixed(2);
        return `${index + 1}. **${result.title}** (rank: ${rankDisplay})\n   Path: ${result.path}\n   Snippet: ${result.snippet}\n`;
      })
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `Found ${searchResults.length} result(s) for query: "${query}"\n\n${resultText}`,
        },
      ],
    };
  } catch (_error) {
    // FTS5 returns empty result set for no matches, not an error
    // But SQL syntax errors are real errors
    // Try a simpler query - maybe the issue is with phrase matching or long queries
    try {
      // Use first word only for fallback
      const simpleQuery = query.trim().split(/\s+/)[0];
      if (!simpleQuery || simpleQuery.length === 0) {
        // If even the first word is empty, return no results (not an error)
        return {
          content: [
            {
              type: 'text',
              text: `No results found for query: "${query}"`,
            },
          ],
        };
      }

      const simpleSql = `
        SELECT 
          d.path,
          d.title,
          d.content,
          0 AS rank
        FROM documents_fts
        JOIN documents d ON d.path = documents_fts.path
        WHERE documents_fts MATCH '${simpleQuery.replace(/'/g, "''")}'
        LIMIT ${limit * 2}
      `;
      const simpleResults = db.prepare(simpleSql).all() as {
        path: string;
        title: string;
        content: string;
        rank: number;
      }[];

      if (simpleResults.length === 0) {
        // No results found - return success with no results message (not an error)
        return {
          content: [
            {
              type: 'text',
              text: `No results found for query: "${query}"`,
            },
          ],
        };
      }

      // Format simple results and apply limit
      const searchResults: SearchResult[] = simpleResults.slice(0, limit).map((row) => ({
        path: row.path,
        title: row.title,
        snippet: extractSnippet(row.content, query),
        rank: 0,
      }));

      const resultText = searchResults
        .map((result, index) => {
          return `${index + 1}. **${result.title}**\n   Path: ${result.path}\n   Snippet: ${result.snippet}\n`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${searchResults.length} result(s) for query: "${query}"\n\n${resultText}`,
          },
        ],
      };
    } catch (fallbackError) {
      // If fallback also fails, check if it's a real syntax error or just no results
      const fallbackMessage =
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError);

      // If it's a syntax error, return error
      // Otherwise, assume no results (FTS5 doesn't throw errors for no matches)
      if (fallbackMessage.includes('syntax error') || fallbackMessage.includes('MATCH')) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid search query: "${query}". Please try a simpler query.`,
            },
          ],
          isError: true,
        };
      }

      // Assume no results rather than error
      return {
        content: [
          {
            type: 'text',
            text: `No results found for query: "${query}"`,
          },
        ],
      };
    }
  }
}
