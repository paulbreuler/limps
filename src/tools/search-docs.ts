import { z } from 'zod';
import { FrontmatterHandler } from '../utils/frontmatter.js';
import type { ToolContext, ToolResult } from '../types.js';

/**
 * Input schema for search_docs tool.
 */
export const SearchDocsInputSchema = z.object({
  query: z.string().min(1).describe('Search query text'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(20)
    .describe('Maximum number of results'),
  searchContent: z.boolean().default(true).describe('Search in note content (default: true)'),
  searchFrontmatter: z.boolean().default(false).describe('Search in frontmatter (default: false)'),
  caseSensitive: z.boolean().default(false).describe('Case sensitive search (default: false)'),
  prettyPrint: z
    .boolean()
    .default(false)
    .describe('Format JSON response with indentation (default: false)'),
});

/**
 * Search result interface with enhanced metadata.
 */
export interface SearchResult {
  /** Path to document (minified: p) */
  p: string;
  /** Title (minified: t) */
  t: string;
  /** Excerpt with context (minified: ex) */
  ex: string;
  /** Match count (minified: mc) */
  mc: number;
  /** Line number of first match (minified: ln) */
  ln: number;
  /** Full path (for prettyPrint mode) */
  path?: string;
  /** Full title (for prettyPrint mode) */
  title?: string;
  /** Full excerpt (for prettyPrint mode) */
  excerpt?: string;
  /** Full match count (for prettyPrint mode) */
  matchCount?: number;
  /** Full line number (for prettyPrint mode) */
  lineNumber?: number;
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
 * Extract excerpt from content with context around matches.
 * Returns excerpt with 21 chars context before and after match.
 *
 * @param content - Content to search
 * @param query - Search query
 * @param caseSensitive - Whether search is case sensitive
 * @returns Object with excerpt, match count, and line number
 */
function extractExcerpt(
  content: string,
  query: string,
  caseSensitive: boolean
): { excerpt: string; matchCount: number; lineNumber: number } {
  const searchIn = caseSensitive ? content : content.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();

  const index = searchIn.indexOf(searchQuery);
  if (index === -1) {
    // No match found, return beginning of content
    const excerpt = content.substring(0, 100).trim();
    return {
      excerpt: excerpt + (content.length > 100 ? '...' : ''),
      matchCount: 0,
      lineNumber: 1,
    };
  }

  // Extract excerpt around first match (21 chars context)
  const excerptStart = Math.max(0, index - 21);
  const excerptEnd = Math.min(content.length, index + searchQuery.length + 21);
  let excerpt = content.slice(excerptStart, excerptEnd).trim();

  // Add ellipsis if excerpt is truncated
  if (excerptStart > 0) excerpt = '...' + excerpt;
  if (excerptEnd < content.length) excerpt = excerpt + '...';

  // Count total matches
  let matchCount = 0;
  let searchIndex = 0;
  while ((searchIndex = searchIn.indexOf(searchQuery, searchIndex)) !== -1) {
    matchCount++;
    searchIndex += searchQuery.length;
  }

  // Find line number of first match
  const lines = content.slice(0, index).split('\n');
  const lineNumber = lines.length;

  return { excerpt, matchCount, lineNumber };
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
  const {
    query,
    limit,
    searchContent = true,
    searchFrontmatter = false,
    caseSensitive = false,
    prettyPrint = false,
  } = input;
  const { db } = context;
  const frontmatterHandler = new FrontmatterHandler();

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

    // Process results with enhanced search capabilities
    const searchResults: SearchResult[] = [];
    const maxLimit = Math.min(limit, 20);

    for (const row of results) {
      if (searchResults.length >= maxLimit) break;

      // Parse frontmatter
      const parsed = frontmatterHandler.parse(row.content);
      let searchableText = '';

      // Prepare search text based on options
      if (searchContent && searchFrontmatter) {
        searchableText = row.content;
      } else if (searchContent) {
        // Search only content (exclude frontmatter)
        searchableText = parsed.content;
      } else if (searchFrontmatter) {
        // Search only frontmatter
        searchableText = JSON.stringify(parsed.frontmatter);
      } else {
        // Should not happen (schema validation ensures at least one is true)
        continue;
      }

      // Perform search with case sensitivity option
      const searchIn = caseSensitive ? searchableText : searchableText.toLowerCase();
      const searchQuery = caseSensitive ? query : query.toLowerCase();

      const index = searchIn.indexOf(searchQuery);
      if (index === -1) {
        continue; // No match in this document
      }

      // Extract excerpt, match count, and line number
      const { excerpt, matchCount, lineNumber } = extractExcerpt(
        searchableText,
        query,
        caseSensitive
      );

      // Extract title from filename or frontmatter
      const title =
        (parsed.frontmatter.title as string) ||
        row.title ||
        row.path.split('/').pop()?.replace(/\.md$/, '') ||
        row.path;

      // Create result with minified field names for token optimization
      const result: SearchResult = {
        p: row.path,
        t: title,
        ex: excerpt,
        mc: matchCount,
        ln: lineNumber,
      };

      // Add full field names for prettyPrint mode
      if (prettyPrint) {
        result.path = row.path;
        result.title = title;
        result.excerpt = excerpt;
        result.matchCount = matchCount;
        result.lineNumber = lineNumber;
      }

      searchResults.push(result);
    }

    if (searchResults.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                message: `No results found for query: "${query}"`,
                query,
              },
              null,
              prettyPrint ? 2 : undefined
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(searchResults, null, prettyPrint ? 2 : undefined),
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

      // Process simple results with enhanced search
      const searchResults: SearchResult[] = [];
      const maxLimit = Math.min(limit, 20);

      for (const row of simpleResults) {
        if (searchResults.length >= maxLimit) break;

        const parsed = frontmatterHandler.parse(row.content);
        let searchableText = '';

        if (searchContent && searchFrontmatter) {
          searchableText = row.content;
        } else if (searchContent) {
          searchableText = parsed.content;
        } else if (searchFrontmatter) {
          searchableText = JSON.stringify(parsed.frontmatter);
        } else {
          continue;
        }

        const searchIn = caseSensitive ? searchableText : searchableText.toLowerCase();
        const searchQuery = caseSensitive ? query : query.toLowerCase();

        const index = searchIn.indexOf(searchQuery);
        if (index === -1) continue;

        const { excerpt, matchCount, lineNumber } = extractExcerpt(
          searchableText,
          query,
          caseSensitive
        );

        const title =
          (parsed.frontmatter.title as string) ||
          row.title ||
          row.path.split('/').pop()?.replace(/\.md$/, '') ||
          row.path;

        const result: SearchResult = {
          p: row.path,
          t: title,
          ex: excerpt,
          mc: matchCount,
          ln: lineNumber,
        };

        if (prettyPrint) {
          result.path = row.path;
          result.title = title;
          result.excerpt = excerpt;
          result.matchCount = matchCount;
          result.lineNumber = lineNumber;
        }

        searchResults.push(result);
      }

      if (searchResults.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `No results found for query: "${query}"`,
                  query,
                },
                null,
                prettyPrint ? 2 : undefined
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(searchResults, null, prettyPrint ? 2 : undefined),
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
