# Agent 0: Semantic Infra

**Plan Location**: `plans/0041-limps-improvements/0041-limps-improvements-plan.md`

## Scope

Features: #1, #2
Own: `packages/limps/src/config.ts`, `packages/limps/src/indexer.ts`, `packages/limps/src/semantic/*`, `packages/limps/src/server-main.ts`
Depend on: none
Block: Agent 1 waiting on semantic storage + embeddings

## Interfaces

### Export

- semantic config block in config loader
- semantic storage schema + chunker + embed pipeline

### Receive

- None

## Features

### #1: Semantic Config + Storage Layer

TL;DR: Add semantic config defaults and vec storage schema.
Status: `GAP`
Test IDs: `semantic-config-defaults`, `semantic-storage-schema`
Files: `packages/limps/src/config.ts`, `packages/limps/src/indexer.ts`

TDD:
1. `semantic-config-defaults` → impl → refactor
2. `semantic-storage-schema` → impl → refactor

### #2: Embedding Pipeline + Chunker

TL;DR: Chunk markdown, embed locally, cache by hash.
Status: `GAP`
Test IDs: `semantic-chunker-headings`, `semantic-embed-local`, `semantic-embed-skip-on-same-hash`
Files: `packages/limps/src/semantic/*`, `packages/limps/src/indexer.ts`

TDD:
1. `semantic-chunker-headings` → impl → refactor
2. `semantic-embed-local` → impl → refactor
3. `semantic-embed-skip-on-same-hash` → impl → refactor

## Done

- [ ] Config defaults + validation
- [ ] Vec schema + metadata tables
- [ ] Chunker + embed pipeline
- [ ] Indexer hooks for semantic indexing
