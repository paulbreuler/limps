/**
 * Suggestion utilities for "did you mean?" functionality.
 * Provides fuzzy matching to help users correct typos in task IDs, plan names, etc.
 */

/**
 * Calculate Levenshtein (edit) distance between two strings.
 * This measures the minimum number of single-character edits (insertions, deletions, substitutions)
 * required to change one string into the other.
 *
 * @param a - First string
 * @param b - Second string
 * @returns Edit distance (0 = identical)
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Options for findSimilar function.
 */
export interface FindSimilarOptions {
  /** Maximum edit distance to consider (default: 3) */
  maxDistance?: number;
  /** Maximum number of results to return (default: 5) */
  limit?: number;
}

/**
 * Find similar strings to the input from a list of candidates.
 * Uses Levenshtein distance to find close matches, sorted by similarity.
 *
 * @param input - The string to find matches for
 * @param candidates - List of possible matches
 * @param options - Configuration options
 * @returns Array of similar strings, sorted by distance (closest first)
 *
 * @example
 * findSimilar('statsu', ['status', 'start', 'stats', 'stop'])
 * // Returns: ['status', 'stats', 'start']
 */
export function findSimilar(
  input: string,
  candidates: string[],
  options?: FindSimilarOptions
): string[] {
  const maxDistance = options?.maxDistance ?? 3;
  const limit = options?.limit ?? 5;

  // Calculate distances for all candidates
  const withDistances = candidates
    .map((candidate) => ({
      value: candidate,
      distance: levenshteinDistance(input.toLowerCase(), candidate.toLowerCase()),
    }))
    .filter((item) => item.distance <= maxDistance && item.distance > 0) // Exclude exact matches
    .sort((a, b) => a.distance - b.distance);

  // Return limited results
  return withDistances.slice(0, limit).map((item) => item.value);
}
