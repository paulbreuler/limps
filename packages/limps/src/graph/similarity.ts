import type { Entity } from './types.js';

export interface SimilarityScore {
  exact: number;
  lexical: number;
  semantic: number;
  structural: number;
  combined: number;
}

export interface EmbeddingStore {
  get(canonicalId: string): number[] | null;
  embed?(text: string): number[];
  findSimilar?(vector: number[], limit: number): { canonicalId: string; score: number }[];
}

export const WEIGHTS = {
  exact: 0.4,
  lexical: 0.2,
  semantic: 0.3,
  structural: 0.1,
} as const;

export const THRESHOLDS = {
  duplicate: 0.95,
  duplicateLexical: 0.98,
  duplicateSemantic: 0.98,
  duplicateStructural: 0.95,
  similar: 0.8,
  related: 0.6,
} as const;

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2)
  );
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 0;
  }

  const intersection = new Set([...a].filter((value) => b.has(value)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

export function cosineSimilarity(
  a: number[] | null | undefined,
  b: number[] | null | undefined
): number {
  if (!a || !b || a.length === 0 || b.length === 0) {
    return 0;
  }

  const dimensions = Math.min(a.length, b.length);
  if (dimensions === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < dimensions; i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function computeStructuralSimilarityFromNeighbors(a: Set<string>, b: Set<string>): number {
  return jaccardSimilarity(a, b);
}

export function computeSimilarity(
  a: Entity,
  b: Entity,
  embeddings: EmbeddingStore,
  options: { structural?: number } = {}
): SimilarityScore {
  const exact = a.canonicalId === b.canonicalId ? 1 : 0;
  const lexical = jaccardSimilarity(tokenize(a.name), tokenize(b.name));
  const semantic = cosineSimilarity(embeddings.get(a.canonicalId), embeddings.get(b.canonicalId));
  const structural = options.structural ?? 0;

  const weightedExact = WEIGHTS.exact * exact;
  const weightedRemainder =
    WEIGHTS.lexical * lexical + WEIGHTS.semantic * semantic + WEIGHTS.structural * structural;
  const nonExactWeight = WEIGHTS.lexical + WEIGHTS.semantic + WEIGHTS.structural;
  const totalWeight = (exact >= 1 ? WEIGHTS.exact : 0) + nonExactWeight;
  const combined = totalWeight > 0 ? (weightedExact + weightedRemainder) / totalWeight : 0;

  return {
    exact,
    lexical,
    semantic,
    structural,
    combined: Math.max(0, Math.min(1, combined)),
  };
}
