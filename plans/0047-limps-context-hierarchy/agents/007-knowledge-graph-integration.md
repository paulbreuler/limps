---
title: Knowledge Graph Integration
status: GAP
persona: coder
depends_on: [000, 001, 002, 003, 004, 005, 006]
external_depends_on: [0042-Knowledge Graph Foundation]
files:
  - src/graph/context-entities.ts
  - src/context/graph-sync.ts
tags: [context, knowledge-graph, integration]
---

# Agent 007: Knowledge Graph Integration

## Objective

Integrate context hierarchy with Plan 0042's knowledge graph.

## Tasks

1. **New entity types** (`src/graph/context-entities.ts`)
   - `context`: workspace.md, project.md, context/*.md
   - `memory`: *.memory.md files
   - `adr`: ADR-*.md files

2. **New relationship types**
   - `INHERITS_FROM`: plan → workspace context
   - `OVERRIDES`: plan value overrides workspace
   - `SUPERSEDES`: ADR → older ADR
   - `REMEMBERS`: agent → memory file
   - `CONTRIBUTES_TO`: agent → plan memory

3. **Graph sync** (`src/context/graph-sync.ts`)
   - Sync context files to knowledge graph on change
   - Update relationships when inheritance changes
   - Track supersession chains in graph

4. **Enhanced queries**
   - "What context does plan 0042 inherit?"
   - "What ADRs affect agent 001?"
   - "Show supersession chain for ADR-0003"

## Integration Points

**Plan 0042 Proactive Watch Mode**:
```typescript
// When context file changes, update graph
async function onContextChange(path: string) {
  await reindexContextFile(path);
  await updateInheritanceRelationships(path);
  await detectSupersessionConflicts(path);
}
```

**Plan 0042 Hybrid Retrieval**:
```typescript
// Context-aware search
const results = await hybridSearch(query, {
  includeInheritedContext: true,
  includeMemory: true,
  filterByPlan: planId
});
```

## Acceptance Criteria

- [ ] Context files appear as entities in knowledge graph
- [ ] Inheritance relationships queryable via graph
- [ ] Supersession chains traversable
- [ ] Memory files linked to agents
- [ ] Watch mode updates context graph
