---
title: Semantic Infra
status: GAP
persona: coder
dependencies: []
blocks: ["001"]
tags: [limps/agent, limps/status/gap, limps/persona/coder]
aliases: ["#000", "Semantic Infra Agent"]
created: 2026-01-28
updated: 2026-01-28
files:
  - path: packages/limps/src/config.ts
    action: modify
  - path: packages/limps/src/indexer.ts
    action: modify
  - path: packages/limps/src/semantic/chunker.ts
    action: add
  - path: packages/limps/src/semantic/embedder.ts
    action: add
  - path: packages/limps/src/semantic/storage.ts
    action: add
  - path: packages/limps/src/server-main.ts
    action: modify
---

# Agent 0: Semantic Infra

**Plan Location**: `plans/0041-limps-improvements/0041-limps-improvements-plan.md`

## Scope

Features: #1, #2
Own: `packages/limps/src/config.ts`, `packages/limps/src/indexer.ts`, `packages/limps/src/semantic/*`, `packages/limps/src/server-main.ts`
Depend on: none
Block: Agent 1 waiting on semantic storage + embeddings

## Interfaces

### Export

- semantic config block in config loader with validation
- semantic storage schema with model metadata
- chunker (character-based) + embed pipeline with error handling

### Receive

- None

## Features

### #1: Semantic Config + Storage Layer

TL;DR: Add semantic config defaults, validation, and vec storage schema with model metadata.
Status: `GAP`
Test IDs: `semantic-config-defaults`, `semantic-storage-schema`, `semantic-startup-validation`
Files: `packages/limps/src/config.ts`, `packages/limps/src/semantic/storage.ts`

TDD:
1. `semantic-config-defaults` → impl config with validation → refactor
2. `semantic-storage-schema` → impl vec tables with model_name, model_dim columns → refactor
3. `semantic-startup-validation` → impl Ollama connectivity check → refactor

### #2: Embedding Pipeline + Chunker

TL;DR: Chunk markdown by characters (2000 char chunks, 200 char overlap), embed locally, handle errors gracefully.
Status: `GAP`
Test IDs: `semantic-chunker-headings`, `semantic-embed-local`, `semantic-embed-skip-on-same-hash`, `semantic-embed-error-handling`
Files: `packages/limps/src/semantic/chunker.ts`, `packages/limps/src/semantic/embedder.ts`, `packages/limps/src/indexer.ts`

**Chunking Rules:**
- Split by markdown headers (h1, h2, h3)
- If section > 2000 characters, split by paragraphs
- If paragraph > 2000 characters, split by sentences
- Overlap: 200 characters between chunks

**Error Handling:**
- Ollama timeout (>5s): retry once, then skip chunk with error logged
- Ollama bad response: log error with response body, skip chunk
- Rate limits: exponential backoff (100ms, 200ms, 400ms, max 3 retries)

TDD:
1. `semantic-chunker-headings` → impl character-based chunker → refactor
2. `semantic-embed-local` → impl Ollama client → refactor
3. `semantic-embed-skip-on-same-hash` → cache by content_hash + model_name → refactor
4. `semantic-embed-error-handling` → impl timeout/retry/backoff → refactor

## Done

- [ ] Config defaults + validation
- [ ] Vec schema with model metadata (model_name, model_dim, content_hash)
- [ ] Startup Ollama validation (warn if unavailable)
- [ ] Character-based chunker (2000 chars, 200 overlap)
- [ ] Embed pipeline with error handling
- [ ] Indexer hooks for semantic indexing
