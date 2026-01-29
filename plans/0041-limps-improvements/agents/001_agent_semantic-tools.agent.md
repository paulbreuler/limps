# Agent 1: Semantic Tools

**Plan Location**: `plans/0041-limps-improvements/0041-limps-improvements-plan.md`

## Scope

Features: #3
Own: `packages/limps/src/tools/semantic-search.ts`, `packages/limps/src/tools/find-similar.ts`, `packages/limps/src/tools/reindex-vectors.ts`, `packages/limps/src/tools/index.ts`
Depend on: Agent 0 for semantic storage + embeddings
Block: None (Agent 2 is now independent)

## Interfaces

### Export

- semantic_search MCP tool
- find_similar MCP tool
- reindex_vectors MCP tool

### Receive

- Semantic storage + embeddings from Agent 0

## Features

### #3: Semantic Search Tools

TL;DR: Add semantic MCP tools with plan/path scoping and observability logging.
Status: `GAP`
Test IDs: `semantic-search-basic`, `find-similar-basic`, `reindex-vectors-force`, `semantic-observability`
Files: `packages/limps/src/tools/semantic-search.ts`, `packages/limps/src/tools/find-similar.ts`, `packages/limps/src/tools/reindex-vectors.ts`

**Observability Requirements:**
Log structured JSON for:
- `semantic.search`: query_length, result_count, latency_ms, used_semantic
- `semantic.reindex`: total_docs, indexed, skipped, errors, latency_ms
- `semantic.error`: operation, error_type, message

**Model Change Detection:**
- reindex_vectors should detect if config model differs from stored model_name
- If mismatch, warn user and require `force: true` to reindex all

TDD:
1. `semantic-search-basic` → impl search with structured logging → refactor
2. `find-similar-basic` → impl similarity lookup → refactor
3. `reindex-vectors-force` → impl rebuild with model detection → refactor
4. `semantic-observability` → impl latency/usage logging → refactor

## Done

- [ ] semantic_search registered with logging
- [ ] find_similar registered
- [ ] reindex_vectors with model mismatch detection
- [ ] Results include path + snippet + similarity + header context
- [ ] Structured observability logs
