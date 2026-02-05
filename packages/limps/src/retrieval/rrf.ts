import type { RetrievalSource } from './router.js';

export interface RankedItem {
  id: string;
  score: number;
  source: RetrievalSource;
}

export interface FusedRankedItem {
  id: string;
  score: number;
  source: 'hybrid';
}

/**
 * Fuse multiple rankings using Reciprocal Rank Fusion.
 */
export function rrf(
  rankings: Map<string, RankedItem[]>,
  weights: { lexical: number; semantic: number; graph: number },
  k = 60
): FusedRankedItem[] {
  const scores = new Map<string, number>();
  const safeK = k <= 0 ? 60 : k;

  for (const [source, items] of rankings.entries()) {
    const weight = weights[source as keyof typeof weights] ?? 0;
    if (weight <= 0) {
      continue;
    }

    for (let rank = 0; rank < items.length; rank++) {
      const item = items[rank];
      if (!item) {
        continue;
      }
      // RRF formula: weight * 1/(k + rank + 1)
      // Note: rank-based, NOT score-based (item.score is ignored)
      const contribution = weight * (1 / (safeK + rank + 1));
      scores.set(item.id, (scores.get(item.id) ?? 0) + contribution);
    }
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, score]) => ({ id, score, source: 'hybrid' }));
}
