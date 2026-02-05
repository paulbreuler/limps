---
title: Deterministic Hybrid Retrieval
status: GAP
persona: coder
depends_on: [000, 001]
files: [src/retrieval/router.ts, src/retrieval/hybrid.ts, src/retrieval/rrf.ts]
tags: [retrieval, rrf, deterministic]
---

# Agent 003: Deterministic Hybrid Retrieval

## Objective

Route queries deterministically with regex patterns. Fuse results with RRF. **No LLM in the retrieval loop.**

## Context

The key insight: AI doesn't need to decide how to retrieve. The SYSTEM decides based on query patterns. AI just consumes results.

From arxiv 2507.03226: "hybrid retrieval strategy that fuses vector similarity with graph traversal using Reciprocal Rank Fusion (RRF)"

## Tasks

### 1. Deterministic Router (`src/retrieval/router.ts`)

```typescript
export type RetrievalStrategy = {
  primary: 'lexical' | 'semantic' | 'graph' | 'hybrid';
  weights: { lexical: number; semantic: number; graph: number };
};

/**
 * Route query to retrieval strategy using regex patterns.
 * NO LLM REASONING HERE.
 */
export function routeQuery(query: string): RetrievalStrategy {
  const q = query.toLowerCase();
  
  // Exact entity references → lexical first
  if (/plan\s*\d+|agent\s*#?\d+|\d{4}[-#]\d{3}/i.test(query)) {
    return { primary: 'lexical', weights: { lexical: 0.6, semantic: 0.2, graph: 0.2 } };
  }
  
  // Relational queries → graph first
  if (/depends|blocks|modifies|what.*blocking|related|overlap|contention|trace/i.test(q)) {
    return { primary: 'graph', weights: { graph: 0.5, semantic: 0.3, lexical: 0.2 } };
  }
  
  // Conceptual queries → semantic first
  if (/how|why|explain|describe|similar|like|what is|tell me about/i.test(q)) {
    return { primary: 'semantic', weights: { semantic: 0.5, lexical: 0.3, graph: 0.2 } };
  }
  
  // Status queries → graph + lexical
  if (/status|progress|completion|blocked|wip|gap|pass|done|remaining/i.test(q)) {
    return { primary: 'graph', weights: { graph: 0.4, lexical: 0.4, semantic: 0.2 } };
  }
  
  // File queries → lexical + graph
  if (/file|\.ts|\.js|\.md|modif|touch|change/i.test(q)) {
    return { primary: 'lexical', weights: { lexical: 0.5, graph: 0.3, semantic: 0.2 } };
  }
  
  // Default: balanced hybrid
  return { primary: 'hybrid', weights: { semantic: 0.4, lexical: 0.3, graph: 0.3 } };
}
```

### 2. Reciprocal Rank Fusion (`src/retrieval/rrf.ts`)

```typescript
export interface RankedItem {
  id: string;
  score: number;
  source: 'lexical' | 'semantic' | 'graph';
}

/**
 * Fuse multiple ranked lists using RRF.
 * From the paper: RRF_score(d) = Σ 1/(k + rank_i(d))
 */
export function rrf(
  rankings: Map<string, RankedItem[]>,
  weights: { lexical: number; semantic: number; graph: number },
  k: number = 60
): RankedItem[] {
  const scores = new Map<string, number>();
  const sources = new Map<string, Set<string>>();
  
  for (const [source, items] of rankings) {
    const weight = weights[source as keyof typeof weights] || 1;
    
    for (let rank = 0; rank < items.length; rank++) {
      const item = items[rank];
      const rrfScore = weight * (1 / (k + rank + 1));
      
      scores.set(item.id, (scores.get(item.id) || 0) + rrfScore);
      
      if (!sources.has(item.id)) sources.set(item.id, new Set());
      sources.get(item.id)!.add(source);
    }
  }
  
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({
      id,
      score,
      source: 'hybrid' as any, // Combined
    }));
}
```

### 3. Hybrid Retriever (`src/retrieval/hybrid.ts`)

```typescript
export class HybridRetriever {
  constructor(
    private storage: GraphStorage,
    private embeddings: EmbeddingStore,
    private fts: FTSIndex
  ) {}
  
  async search(query: string, topK: number = 10): Promise<SearchResult[]> {
    const strategy = routeQuery(query);
    
    // Over-retrieve, then fuse
    const overRetrieveK = topK * 3;
    
    const rankings = new Map<string, RankedItem[]>();
    
    // Lexical retrieval (FTS5)
    if (strategy.weights.lexical > 0) {
      const lexicalResults = this.fts.search(query, overRetrieveK);
      rankings.set('lexical', lexicalResults.map((r, i) => ({
        id: r.canonicalId,
        score: r.score,
        source: 'lexical' as const,
      })));
    }
    
    // Semantic retrieval (embeddings)
    if (strategy.weights.semantic > 0) {
      const queryEmbed = await this.embeddings.embed(query);
      const semanticResults = this.embeddings.findSimilar(queryEmbed, overRetrieveK);
      rankings.set('semantic', semanticResults.map((r, i) => ({
        id: r.canonicalId,
        score: r.similarity,
        source: 'semantic' as const,
      })));
    }
    
    // Graph retrieval (traversal from seed entities)
    if (strategy.weights.graph > 0) {
      const seeds = this.extractSeeds(query);
      const graphResults = this.traverseFromSeeds(seeds, overRetrieveK);
      rankings.set('graph', graphResults.map((r, i) => ({
        id: r.canonicalId,
        score: 1 / (i + 1), // Rank-based score
        source: 'graph' as const,
      })));
    }
    
    // Fuse with RRF
    const fused = rrf(rankings, strategy.weights);
    
    // Return top K with full entities
    return fused.slice(0, topK).map(item => ({
      entity: this.storage.getEntity(item.id)!,
      score: item.score,
      strategy: strategy.primary,
    }));
  }
  
  private extractSeeds(query: string): string[] {
    // Extract entity IDs from query using patterns
    const seeds: string[] = [];
    
    // Plan references
    const planMatches = query.matchAll(/plan\s*(\d{4})/gi);
    for (const m of planMatches) seeds.push(`plan:${m[1]}`);
    
    // Agent references
    const agentMatches = query.matchAll(/(\d{4})#(\d{3})/g);
    for (const m of agentMatches) seeds.push(`agent:${m[1]}#${m[2]}`);
    
    return seeds;
  }
  
  private traverseFromSeeds(seeds: string[], limit: number): Entity[] {
    const visited = new Set<string>();
    const results: Entity[] = [];
    
    for (const seed of seeds) {
      const entity = this.storage.getEntity(seed);
      if (!entity) continue;
      
      // 1-hop traversal (from arxiv paper: 1-hop is sufficient)
      const neighbors = this.storage.getNeighbors(entity.id);
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor.canonicalId)) {
          visited.add(neighbor.canonicalId);
          results.push(neighbor);
          if (results.length >= limit) return results;
        }
      }
    }
    
    return results;
  }
}
```

## Acceptance Criteria

- [ ] Router categorizes queries correctly (>90% accuracy on test set)
- [ ] RRF fusion produces stable rankings
- [ ] Graph traversal limited to 1-hop (per arxiv paper)
- [ ] Performance: <200ms for hybrid query
- [ ] **No LLM calls in retrieval path**

## Testing

```typescript
describe('Deterministic Router', () => {
  it('routes "plan 0042" to lexical-first');
  it('routes "what blocks agent 003" to graph-first');
  it('routes "explain authentication" to semantic-first');
  it('routes "status of plan 41" to graph+lexical');
});

describe('RRF Fusion', () => {
  it('combines rankings with correct weights');
  it('handles items appearing in multiple lists');
  it('produces deterministic output for same input');
});
```
