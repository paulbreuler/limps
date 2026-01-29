# Agent 2: Query Improvements

**Plan Location**: `plans/0041-limps-improvements/0041-limps-improvements-plan.md`

## Scope

Features: #4
Own: `packages/limps/src/tools/search-docs.ts`, `packages/limps/src/tools/query-docs.ts`, `packages/limps/src/tools/index.ts`
Depend on: Agent 1 for semantic integration (optional)
Block: Agent 4 needs query tool documented

## Interfaces

### Export

- search_docs filters (path/plan/tags)
- query_docs MCP tool

### Receive

- semantic_search output (optional)

## Features

### #4: Query Improvements + query_docs

TL;DR: Add scoped filters and query_docs wrapper.
Status: `GAP`
Test IDs: `search-docs-path-filter`, `query-docs-wrapper`
Files: `packages/limps/src/tools/search-docs.ts`, `packages/limps/src/tools/query-docs.ts`

TDD:
1. `search-docs-path-filter` → impl → refactor
2. `query-docs-wrapper` → impl → refactor

## Done

- [ ] Filters respected
- [ ] query_docs works with/without semantic
