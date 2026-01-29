# Agent 1: Semantic Tools

**Plan Location**: `plans/0041-limps-improvements/0041-limps-improvements-plan.md`

## Scope

Features: #3
Own: `packages/limps/src/tools/semantic-search.ts`, `packages/limps/src/tools/find-similar.ts`, `packages/limps/src/tools/reindex-vectors.ts`, `packages/limps/src/tools/index.ts`
Depend on: Agent 0 for semantic storage + embeddings
Block: Agent 2 waits on semantic tool availability

## Interfaces

### Export

- semantic_search MCP tool
- find_similar MCP tool
- reindex_vectors MCP tool

### Receive

- Semantic storage + embeddings

## Features

### #3: Semantic Search Tools

TL;DR: Add semantic MCP tools with plan/path scoping.
Status: `GAP`
Test IDs: `semantic-search-basic`, `find-similar-basic`, `reindex-vectors-force`
Files: `packages/limps/src/tools/*`

TDD:
1. `semantic-search-basic` → impl → refactor
2. `find-similar-basic` → impl → refactor
3. `reindex-vectors-force` → impl → refactor

## Done

- [ ] Tools registered
- [ ] Results include path + snippet + similarity
- [ ] Plan/path scoping works
