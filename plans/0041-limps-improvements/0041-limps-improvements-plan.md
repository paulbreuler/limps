# limps Improvements — Full Feature Plan

## Overview

Add a local-only semantic discovery layer and expand query capabilities. Preserve prefix-based plan/agent ordering as the deterministic workflow backbone; semantic search augments discovery only.

**Note:** AI-assisted requirements generation has been moved to a separate plan (0042) for cleaner scope separation.

## Goals

- Semantic search for conceptual matches across plans.
- Query improvements with scoped filters and a concise question-answer tool.
- Local-only operation with clear guardrails and docs.
- Observable, debuggable semantic infrastructure.

## Non-Goals

- Replacing prefix ordering or plan structure.
- Cloud embedding providers or hosted services.
- Git-based versioning features (use Git).
- AI-assisted content generation (see Plan 0042).

## Constraints

- Local-only embeddings and storage.
- No behavior regressions in existing MCP tools.
- Keep plan/agent prefixes as the source of ordering.
- Chunk sizes defined in characters (not tokens) for model portability.

## Features

### #1: Semantic Config + Storage Layer

TL;DR: Add semantic config and SQLite vector storage with model metadata.
Status: `GAP`

**Gherkin**
- Scenario: semantic config is opt-in
  - Given semantic config is disabled
  - When the server starts
  - Then no embeddings are generated and semantic tools return "disabled" message

- Scenario: startup validation with Ollama unavailable
  - Given semantic.enabled is true
  - And Ollama is not running
  - When the server starts
  - Then server starts successfully with warning logged
  - And semantic tools return "Ollama unavailable" message

**TDD**
1. `semantic-config-defaults` → add config defaults with validation → refactor config loader
2. `semantic-storage-schema` → create vec tables with model metadata → refactor schema init
3. `semantic-startup-validation` → validate Ollama connectivity at startup → log warning if unavailable

---

### #2: Embedding Pipeline + Chunker

TL;DR: Chunk markdown by characters (not tokens), embed locally, store vectors with model metadata.
Status: `GAP`

**Chunking Strategy (Character-Based)**
- Split by markdown headers (h1, h2, h3)
- If section > 2000 characters, split by paragraphs
- If paragraph > 2000 characters, split by sentences
- Overlap: 200 characters between chunks
- Reference: ~4 chars/token for English text, so 2000 chars ≈ 500 tokens

**Gherkin**
- Scenario: chunker respects headings
  - Given a markdown file with headings
  - When embeddings are generated
  - Then chunks align to headings and character limits

- Scenario: embedding with model metadata
  - Given a document to embed
  - When embeddings are generated
  - Then stored vectors include model_name and model_dim

**TDD**
1. `semantic-chunker-headings` → implement character-based chunker → refactor
2. `semantic-embed-local` → call local embed API with error handling → refactor
3. `semantic-embed-skip-on-same-hash` → cache by content hash + model name → refactor
4. `semantic-embed-error-handling` → handle timeouts, bad responses, rate limits → refactor

---

### #3: Semantic Search Tools

TL;DR: Add `semantic_search`, `find_similar`, `reindex_vectors` MCP tools with observability.
Status: `GAP`

**Gherkin**
- Scenario: semantic search returns relevant chunks
  - Given embeddings exist
  - When a user queries semantic_search
  - Then results include path, snippet, similarity, header context

- Scenario: semantic search logs usage metrics
  - Given a semantic search is performed
  - Then query latency and result count are logged

- Scenario: reindex detects model change
  - Given embeddings exist for model A
  - When config changes to model B
  - And reindex_vectors is called
  - Then all embeddings are regenerated (no skip by hash)

**TDD**
1. `semantic-search-basic` → implement search with logging → refactor
2. `find-similar-basic` → implement similarity lookup → refactor
3. `reindex-vectors-force` → rebuild on demand with model detection → refactor
4. `semantic-observability` → add latency/usage logging → refactor

---

### #4: Query Improvements + query_docs

TL;DR: Add scoped filters for search and a concise query tool. Semantic integration is optional.
Status: `GAP`

**Note:** This feature works with or without semantic search. When semantic is unavailable, falls back to FTS5.

**Gherkin**
- Scenario: path-scoped search
  - Given a query and path filter
  - When search_docs is called
  - Then results are scoped to that path

- Scenario: query_docs without semantic
  - Given semantic is disabled
  - When query_docs is called
  - Then results use FTS5 with scoped filters

- Scenario: query_docs with semantic
  - Given semantic is enabled
  - When query_docs is called with preferSemantic: true
  - Then results blend semantic and FTS5 results

**TDD**
1. `search-docs-path-filter` → filter results by path → refactor
2. `query-docs-fts-fallback` → implement FTS5-only mode → refactor
3. `query-docs-semantic-blend` → blend semantic + FTS5 when available → refactor

---

### #5: Documentation Updates

TL;DR: Document semantic setup, query tools, config options, and troubleshooting.
Status: `GAP`

**Gherkin**
- Scenario: README reflects local-only semantics
  - Given new tools
  - When README is updated
  - Then local-only constraints and Ollama setup are explicit

**TDD**
1. `docs-semantic-setup` → add setup section with Ollama install → refactor
2. `docs-config-reference` → document all semantic config options → refactor
3. `docs-troubleshooting` → add common issues (Ollama not running, wrong model dims) → refactor

---

## Component Design

- `config.ts`: add `semantic` config block with validation
- `indexer.ts`: hook semantic indexing to file changes
- `semantic/chunker.ts`: character-based markdown chunker
- `semantic/embedder.ts`: Ollama client with error handling
- `semantic/storage.ts`: sqlite-vec operations with model metadata
- `tools/*`: semantic tools + query_docs
- `README.md`: usage, setup, troubleshooting

## Data Model

```sql
CREATE VIRTUAL TABLE vec_documents USING vec0(
  embedding float[768]  -- dimension validated at startup
);

CREATE TABLE doc_embeddings (
  id INTEGER PRIMARY KEY,
  doc_path TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_header TEXT,           -- nearest heading for context
  content_hash TEXT NOT NULL,  -- for change detection
  model_name TEXT NOT NULL,    -- e.g., "nomic-embed-text"
  model_dim INTEGER NOT NULL,  -- e.g., 768
  vec_rowid INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(doc_path, chunk_index)
);

CREATE INDEX idx_doc_path ON doc_embeddings(doc_path);
CREATE INDEX idx_model ON doc_embeddings(model_name);
CREATE INDEX idx_content_hash ON doc_embeddings(content_hash);
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Ollama not running | Log warning, semantic tools return "unavailable", FTS5 fallback |
| Ollama timeout (>5s) | Retry once, then skip chunk with error logged |
| Ollama bad response | Log error with response body, skip chunk |
| Wrong model dimensions | Startup error with clear message |
| Embedding rate limit | Exponential backoff (100ms, 200ms, 400ms, max 3 retries) |

## Observability

Log the following metrics (structured JSON when possible):

| Event | Fields |
|-------|--------|
| `semantic.search` | query_length, result_count, latency_ms, used_semantic |
| `semantic.index` | doc_path, chunk_count, latency_ms, skipped_unchanged |
| `semantic.reindex` | total_docs, indexed, skipped, errors, latency_ms |
| `semantic.error` | operation, error_type, message |

## Graceful Degradation

- If Ollama is unavailable, log warning, skip embeddings
- Semantic tools return clear "disabled/unavailable" message with reason
- query_docs falls back to FTS5 transparently
- Existing tools unaffected

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Embed single chunk | ~50ms | local Ollama |
| Index full plan (10 agents) | ~2s | batched |
| Search query | <100ms | sqlite-vec |
| Full reindex (100 docs) | ~30s | background |

## Testing Strategy

- **Unit**: chunking logic (character boundaries, overlap), config validation
- **Integration**: sqlite-vec queries, Ollama connection, error handling
- **E2E**: semantic_search + find_similar + query_docs with/without semantic
- **Perf**: indexing throughput, search latency percentiles

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Ollama not installed | High | Clear error + disable semantic tools + docs |
| Wrong model dims | High | Validate dimension on startup, fail fast |
| Model change breaks index | Medium | Track model in metadata, detect and warn on mismatch |
| Large doc sets | Medium | Chunk cap + background indexing + progress logging |

## Agent Assignments

- **Agent 0**: Features #1–#2 (Semantic config, storage, chunking, embedding) — no dependencies
- **Agent 1**: Feature #3 (Semantic search tools) — depends on Agent 0
- **Agent 2**: Feature #4 (Query improvements) — **no dependencies** (works without semantic)
- **Agent 3**: Feature #5 (Docs) — depends on Agents 0–2

## Acceptance Criteria

- [ ] Semantic search works locally with Ollama embeddings
- [ ] Prefix ordering remains canonical for plan workflows
- [ ] Model metadata stored with embeddings for migration safety
- [ ] query_docs returns results with scoped filters (works with or without semantic)
- [ ] Graceful degradation when Ollama unavailable
- [ ] Observability logs for search/index operations
- [ ] README updated with setup, config reference, and troubleshooting
