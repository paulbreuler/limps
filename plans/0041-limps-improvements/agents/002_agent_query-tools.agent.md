# Agent 2: Query Improvements

**Plan Location**: `plans/0041-limps-improvements/0041-limps-improvements-plan.md`

## Scope

Features: #4
Own: `packages/limps/src/tools/search-docs.ts`, `packages/limps/src/tools/query-docs.ts`, `packages/limps/src/tools/index.ts`
Depend on: **none** (semantic integration is optional, FTS5 fallback is default)
Block: Agent 3 needs query tool documented

## Interfaces

### Export

- search_docs filters (path/plan/tags)
- query_docs MCP tool (works with or without semantic)

### Receive

- semantic_search output (optional, when available)

## Features

### #4: Query Improvements + query_docs

TL;DR: Add scoped filters and query_docs wrapper. Works independently of semantic search.
Status: `GAP`
Test IDs: `search-docs-path-filter`, `query-docs-fts-fallback`, `query-docs-semantic-blend`
Files: `packages/limps/src/tools/search-docs.ts`, `packages/limps/src/tools/query-docs.ts`

**Key Design Decision:**
This agent has **no dependencies** because query_docs must work without semantic search. The semantic integration is additive — when semantic is available and `preferSemantic: true`, blend results. Otherwise, use FTS5 only.

**Fallback Behavior:**
1. If semantic disabled → FTS5 only
2. If semantic enabled but Ollama unavailable → FTS5 only with warning
3. If semantic enabled and available → blend FTS5 + semantic based on `preferSemantic` flag

TDD:
1. `search-docs-path-filter` → impl path/plan/tag filters → refactor
2. `query-docs-fts-fallback` → impl FTS5-only mode (no semantic deps) → refactor
3. `query-docs-semantic-blend` → impl blended results when semantic available → refactor

## Done

- [ ] Path/plan/tag filters on search_docs
- [ ] query_docs works without semantic (FTS5 only)
- [ ] query_docs blends semantic when available
- [ ] Clear fallback messaging in responses
