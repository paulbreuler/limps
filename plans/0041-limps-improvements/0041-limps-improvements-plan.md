# limps Improvements — Full Feature Plan

## Overview

Add a local-only semantic discovery layer, expand query capabilities, and ship AI-assisted requirements generation with explicit human review. Preserve prefix-based plan/agent ordering as the deterministic workflow backbone; semantic search augments discovery only.

## Goals

- Semantic search for conceptual matches across plans.
- Query improvements with scoped filters and a concise question-answer tool.
- AI-assisted requirements generation with `AI_DRAFT` review status.
- Local-only operation with clear guardrails and docs.

## Non-Goals

- Replacing prefix ordering or plan structure.
- Cloud embedding providers or hosted services.
- Git-based versioning features (use Git).

## Constraints

- Local-only embeddings and storage.
- No behavior regressions in existing MCP tools.
- Keep plan/agent prefixes as the source of ordering.

## Features

### #1: Semantic Config + Storage Layer

TL;DR: Add semantic config and SQLite vector storage with metadata.
Status: `GAP`

**Gherkin**
- Scenario: semantic config is opt-in
  - Given semantic config is disabled
  - When the server starts
  - Then no embeddings are generated

**TDD**
1. `semantic-config-defaults` → add config defaults → refactor config loader
2. `semantic-storage-schema` → create vec tables → refactor schema init

---

### #2: Embedding Pipeline + Chunker

TL;DR: Chunk markdown, embed locally, and store vectors keyed by `doc_path` + `chunk_index`.
Status: `GAP`

**Gherkin**
- Scenario: chunker respects headings
  - Given a markdown file with headings
  - When embeddings are generated
  - Then chunks align to headings and size limits

**TDD**
1. `semantic-chunker-headings` → implement chunker → refactor
2. `semantic-embed-local` → call local embed API → refactor
3. `semantic-embed-skip-on-same-hash` → cache by hash → refactor

---

### #3: Semantic Search Tools

TL;DR: Add `semantic_search`, `find_similar`, `reindex_vectors` MCP tools.
Status: `GAP`

**Gherkin**
- Scenario: semantic search returns relevant chunks
  - Given embeddings exist
  - When a user queries semantic_search
  - Then results include path, snippet, similarity

**TDD**
1. `semantic-search-basic` → implement search → refactor
2. `find-similar-basic` → implement similarity lookup → refactor
3. `reindex-vectors-force` → rebuild on demand → refactor

---

### #4: Query Improvements + query_docs

TL;DR: Add scoped filters for search and a concise query tool.
Status: `GAP`

**Gherkin**
- Scenario: path-scoped search
  - Given a query and path filter
  - When search_docs is called
  - Then results are scoped to that path

**TDD**
1. `search-docs-path-filter` → filter results by path → refactor
2. `query-docs-wrapper` → add query_docs tool → refactor

---

### #5: AI-Assisted Requirements Generation

TL;DR: Generate requirements artifacts with `AI_DRAFT` status and review checklist.
Status: `GAP`

**Gherkin**
- Scenario: AI draft output
  - Given a prompt
  - When generate_requirements is called
  - Then output includes AI_DRAFT frontmatter and review checklist

**TDD**
1. `generate-requirements-template` → template output → refactor
2. `generate-requirements-llm-optional` → optional sub-query → refactor

---

### #6: Documentation Updates

TL;DR: Document semantic setup, query tools, and AI draft workflow.
Status: `GAP`

**Gherkin**
- Scenario: README reflects local-only semantics
  - Given new tools
  - When README is updated
  - Then local-only constraints are explicit

**TDD**
1. `docs-semantic-setup` → add setup section → refactor
2. `docs-ai-draft` → add AI draft guidance → refactor

---

## Component Design

- `config.ts`: add `semantic` config block with defaults
- `indexer.ts`: hook semantic indexing to file changes
- `semantic/*`: chunker, embedding client, vector search
- `tools/*`: semantic tools + query_docs + generate_requirements
- `README.md`: usage, setup, and constraints

## Data Model (from Plan 29)

```sql
CREATE VIRTUAL TABLE vec_documents USING vec0(
  embedding float[768]
);

CREATE TABLE doc_embeddings (
  id INTEGER PRIMARY KEY,
  doc_path TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  vec_rowid INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(doc_path, chunk_index)
);

CREATE INDEX idx_doc_path ON doc_embeddings(doc_path);
```

## Chunking Strategy (from Plan 29)

1. Split by markdown headers (h1, h2, h3)
2. If section > 512 tokens, split by paragraphs
3. If paragraph > 512 tokens, split by sentences
4. Overlap: 50 tokens between chunks

## Graceful Degradation (from Plan 29)

- If Ollama is unavailable, log warning, skip embeddings
- Semantic tools return a clear “disabled/unavailable” message
- Search falls back to FTS5

## Performance Targets (from Plan 29)

| Operation | Target | Notes |
|---|---|---|
| Embed single chunk | ~50ms | local Ollama |
| Index full plan (10 agents) | ~2s | batched |
| Search query | <100ms | sqlite-vec |
| Full reindex (100 docs) | ~30s | background |

## Testing Strategy (from Plan 29)

- Unit: chunking logic, embedding pipeline
- Integration: sqlite-vec queries, Ollama connection
- E2E: semantic_search + find_similar + query_docs
- Perf: indexing throughput + latency

## Risks & Mitigations (from Plan 29)

| Risk | Impact | Mitigation |
|---|---|---|
| Ollama not installed | High | Clear error + disable semantic tools |
| Wrong model dims | High | Validate dimension on startup |
| Large doc sets | Medium | Chunk cap + background indexing |

## Agent Assignments

- Agent 0: Features #1–#2 (Semantic config, storage, chunking)
- Agent 1: Feature #3 (Semantic search tools) depends on Agent 0
- Agent 2: Feature #4 (Query improvements) depends on Agent 1 for optional semantic integration
- Agent 3: Feature #5 (AI generation) independent
- Agent 4: Feature #6 (Docs) depends on Agents 0–3

## Acceptance Criteria

- Semantic search works locally with Ollama embeddings.
- Prefix ordering remains canonical for plan workflows.
- query_docs returns concise answers with scoped filters.
- generate_requirements outputs `AI_DRAFT` and review checklist.
- README updated with setup and limitations.
