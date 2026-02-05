---
title: Entity Resolution & Similarity
status: PASS
persona: coder
depends_on: [000, 001]
files: [src/graph/resolver.ts, src/graph/similarity.ts]
tags: [similarity, dedup, embeddings]
---

# Agent 002: Entity Resolution & Similarity

## Objective

Detect duplicate and similar entities across plans using embedding similarity + fuzzy matching. **No LLM reasoning.**

## Context

Entity resolution runs automatically during indexing. It surfaces potential duplicates proactively — the system detects problems, not the AI.

## Tasks

### 1. Similarity Scoring (`src/graph/similarity.ts`)

```typescript
export interface SimilarityScore {
  exact: number;      // 0 or 1 (canonical ID match)
  lexical: number;    // 0-1 (Jaccard on tokens)
  semantic: number;   // 0-1 (embedding cosine)
  structural: number; // 0-1 (shared relationships)
  combined: number;   // Weighted combination
}

export const WEIGHTS = {
  exact: 0.4,
  lexical: 0.2,
  semantic: 0.3,
  structural: 0.1,
};

export const THRESHOLDS = {
  duplicate: 0.95,    // Almost certainly same thing
  similar: 0.80,      // Worth flagging
  related: 0.60,      // Weak connection
};

export function computeSimilarity(a: Entity, b: Entity, embeddings: EmbeddingStore): SimilarityScore {
  const exact = a.canonicalId === b.canonicalId ? 1 : 0;
  const lexical = jaccardSimilarity(tokenize(a.name), tokenize(b.name));
  const semantic = cosineSimilarity(
    embeddings.get(a.canonicalId),
    embeddings.get(b.canonicalId)
  );
  const structural = computeStructuralSimilarity(a, b);
  
  const combined = 
    WEIGHTS.exact * exact +
    WEIGHTS.lexical * lexical +
    WEIGHTS.semantic * semantic +
    WEIGHTS.structural * structural;
  
  return { exact, lexical, semantic, structural, combined };
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/\W+/).filter(t => t.length > 2));
}
```

### 2. Entity Resolver (`src/graph/resolver.ts`)

```typescript
export interface ResolutionResult {
  duplicates: Array<{ a: Entity; b: Entity; score: SimilarityScore }>;
  similar: Array<{ a: Entity; b: Entity; score: SimilarityScore }>;
  suggestions: string[];
}

export class EntityResolver {
  constructor(
    private storage: GraphStorage,
    private embeddings: EmbeddingStore
  ) {}
  
  /**
   * Find all potential duplicates/similar entities
   * Runs during indexing, results stored for proactive surfacing
   */
  resolveAll(): ResolutionResult {
    const result: ResolutionResult = { duplicates: [], similar: [], suggestions: [] };
    
    // Compare features across plans (most common duplication)
    const features = this.storage.getEntitiesByType('feature');
    for (let i = 0; i < features.length; i++) {
      for (let j = i + 1; j < features.length; j++) {
        const score = computeSimilarity(features[i], features[j], this.embeddings);
        
        if (score.combined >= THRESHOLDS.duplicate) {
          result.duplicates.push({ a: features[i], b: features[j], score });
        } else if (score.combined >= THRESHOLDS.similar) {
          result.similar.push({ a: features[i], b: features[j], score });
        }
      }
    }
    
    // Generate suggestions
    for (const dup of result.duplicates) {
      result.suggestions.push(
        `DUPLICATE: "${dup.a.name}" (${dup.a.canonicalId}) and "${dup.b.name}" (${dup.b.canonicalId}) ` +
        `are ${(dup.score.combined * 100).toFixed(0)}% similar. Consider consolidating.`
      );
    }
    
    return result;
  }
  
  /**
   * Check if a new feature would duplicate existing ones
   */
  checkNewFeature(name: string, description: string): Entity[] {
    const embedding = this.embeddings.embed(name + ' ' + description);
    const candidates = this.embeddings.findSimilar(embedding, 10);
    
    return candidates
      .filter(c => c.score >= THRESHOLDS.similar)
      .map(c => this.storage.getEntity(c.canonicalId)!);
  }
}
```

### 3. Store SIMILAR_TO Relationships

When similarity detected, create relationship:

```typescript
if (score.combined >= THRESHOLDS.similar) {
  storage.upsertRelationship({
    sourceId: a.id,
    targetId: b.id,
    relationType: 'SIMILAR_TO',
    confidence: score.combined,
    metadata: { 
      lexical: score.lexical, 
      semantic: score.semantic,
      detectedAt: new Date().toISOString()
    },
  });
}
```

## Acceptance Criteria

- [ ] Jaccard similarity computed correctly
- [ ] Cosine similarity uses embeddings from Plan 0041
- [ ] Structural similarity counts shared relationships
- [ ] SIMILAR_TO relationships created automatically
- [ ] `checkNewFeature` prevents duplication before it happens
- [ ] Performance: <5s for 100 plans

## Integration with Plan 0041

This agent consumes embeddings from Plan 0041's semantic search infrastructure. If 0041 isn't complete, use a simple embedding (e.g., OpenAI API directly) as fallback.
