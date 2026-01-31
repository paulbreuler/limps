---
title: Integration & Migration
status: GAP
persona: coder
depends: [000, 001, 002, 003, 004]
files: [src/index.ts, src/mcp/index.ts, docs/migration.md]
tags: [limps/agent, integration, migration, backward-compat]
---

# Agent 005: Integration & Migration

## Overview

Integrate the knowledge graph with existing limps infrastructure and related plans. Ensure backward compatibility.

## Acceptance Criteria

- [ ] Existing MCP tools continue working unchanged
- [ ] New graph commands are additive, not breaking
- [ ] Plan 0028 (Obsidian) can consume CLI
- [ ] Plan 0041 (Semantic Search) embeddings used by hybrid retriever
- [ ] Plan 0033 (Self-Updating) can use graph for drift detection
- [ ] Plan 0030 (Scoring) can use graph for dependency-aware scoring
- [ ] Migration docs for existing users

## Integration Points

### Plan 0028: Obsidian Plugin (Primary Human UI)

Obsidian plugin consumes CLI, not reimplements logic:

```typescript
// Obsidian plugin (Plan 0028)
class LimpsPlugin extends Plugin {
  private storage: GraphStorage;
  
  async onload() {
    // Register command palette commands
    this.addCommand({
      id: 'limps-health',
      name: 'Run Health Check',
      callback: async () => {
        const result = await exec('limps graph health --json');
        this.showConflictPanel(JSON.parse(result));
      }
    });
    
    // File watcher integration
    this.registerEvent(
      this.app.vault.on('modify', async (file) => {
        if (isPlanFile(file)) {
          await exec(`limps graph reindex --file "${file.path}"`);
          await this.refreshConflictPanel();
        }
      })
    );
  }
  
  // Use Obsidian's native graph view for entity relationships
  async showEntityGraph(entityId: string) {
    const trace = await exec(`limps graph trace ${entityId} --json`);
    // Transform to Obsidian graph format
    this.app.workspace.trigger('graph:open', transformed);
  }
}
```

### Plan 0041: Semantic Search (Component)

Semantic search becomes a component of hybrid retrieval:

```typescript
// src/retrieval/hybrid.ts

import { SemanticRetriever } from '../semantic';  // From Plan 0041

export class HybridRetriever {
  constructor(
    private semantic: SemanticRetriever | null,  // May not exist yet
    private lexical: LexicalRetriever,
    private graph: GraphRetriever
  ) {}
  
  async search(query: string, topK: number): Promise<SearchResult[]> {
    const strategy = classifyQuery(query);
    
    const results = await Promise.all([
      this.semantic ? this.semantic.search(query, topK * 3) : [],
      this.lexical.search(query, topK * 3),
      this.graph.search(query, topK * 3)
    ]);
    
    // Adjust weights if semantic not available
    const weights = this.semantic 
      ? strategy.weights
      : { lexical: 0.6, graph: 0.4, semantic: 0 };
    
    return rrf(results, weights).slice(0, topK);
  }
}
```

### Plan 0033: Self-Updating (Enhanced)

Graph enables better drift detection:

```typescript
// Plan 0033 uses graph MODIFIES relationships
async function detectFileDrift(storage: GraphStorage): Promise<Drift[]> {
  const modifies = await storage.findRelationships({ type: 'MODIFIES' });
  const drifts: Drift[] = [];
  
  for (const rel of modifies) {
    const filePath = rel.target.canonical_id;
    
    // Check if file exists
    if (!await fileExists(filePath)) {
      drifts.push({
        type: 'missing_file',
        agent: rel.source.canonical_id,
        file: filePath,
        recommendation: 'Update agent to remove file reference or create file'
      });
    }
    
    // Check if file was modified since last index
    const stat = await fs.stat(filePath);
    if (stat.mtime > rel.metadata.indexed_at) {
      drifts.push({
        type: 'file_modified',
        agent: rel.source.canonical_id,
        file: filePath,
        recommendation: 'Run `limps graph reindex` to update'
      });
    }
  }
  
  return drifts;
}
```

### Plan 0030: Scoring Weights (Enhanced)

Graph enables dependency-aware scoring:

```typescript
// Plan 0030 uses graph for blocker detection
async function scoreAgent(agent: Agent, storage: GraphStorage): Promise<number> {
  let score = 100;
  
  // Existing scoring factors...
  score += priorityScore(agent);
  score += workloadScore(agent);
  
  // NEW: Graph-based scoring
  
  // Penalty for blocked dependencies
  const blockers = await storage.traverse(
    agent.id,
    ['DEPENDS_ON'],
    'out',
    3
  );
  const activeBlockers = blockers.filter(b => 
    b.metadata.status !== 'PASS'
  );
  score -= activeBlockers.length * 10;
  
  // Penalty for file contention
  const files = await storage.findRelationships({
    source_id: agent.id,
    type: 'MODIFIES'
  });
  for (const file of files) {
    const otherAgents = await storage.findRelationships({
      target_id: file.target_id,
      type: 'MODIFIES'
    });
    const wipConflicts = otherAgents.filter(a => 
      a.source_id !== agent.id && 
      a.source.metadata.status === 'WIP'
    );
    score -= wipConflicts.length * 15;
  }
  
  return Math.max(0, score);
}
```

## Migration

### For Existing Users

1. **No breaking changes** — existing commands work as before
2. **New commands are additive** — `limps graph *` is new namespace
3. **MCP tools augmented** — new graph tools alongside existing

### Migration Steps

```bash
# 1. Update limps
npm install -g @limps/cli@latest

# 2. Initialize graph (one-time)
limps graph reindex

# 3. Optional: start watch mode
limps graph watch --daemon

# 4. Verify
limps graph stats
limps graph health
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/index.ts` | Modify | Register graph commands |
| `src/mcp/index.ts` | Modify | Register graph MCP tools |
| `docs/migration.md` | Create | Migration guide |
| `docs/integration.md` | Create | Integration guide |

## Testing

```typescript
describe('Backward Compatibility', () => {
  it('existing commands still work', async () => {
    const result = await exec('limps list_plans');
    expect(result.exitCode).toBe(0);
  });
  
  it('existing MCP tools still work', async () => {
    const result = await listPlans.handler({});
    expect(result).toBeDefined();
  });
});
```
