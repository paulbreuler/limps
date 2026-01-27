# limps Semantic Search

## Overview

Add vector-based semantic search to limps using sqlite-vec for storage and local ollama for embeddings. Fully local, no external APIs, works offline.

## Why Semantic Search

Current FTS5 search is keyword-based:
- ✅ Fast
- ✅ Works great for exact matches
- ❌ Misses conceptual matches ("auth flow" won't find "login implementation")
- ❌ No "find similar" capability
- ❌ Typo-sensitive

Semantic search adds:
- 🚀 Concept-based matching
- 🚀 "Find similar to this agent"
- 🚀 Cross-plan discovery
- 🚀 Natural language queries

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      limps server                        │
│                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │  Document    │───▶│  Embedding   │───▶│ sqlite-vec│  │
│  │  Watcher     │    │  Pipeline    │    │  Storage  │  │
│  └──────────────┘    └──────┬───────┘    └─────┬─────┘  │
│                             │                   │        │
│                      ┌──────▼───────┐          │        │
│                      │   ollama     │          │        │
│                      │ (local LLM)  │          │        │
│                      └──────────────┘          │        │
│                                                 │        │
│  ┌──────────────┐                              │        │
│  │ Search Query │──────────────────────────────┘        │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Indexing**: Document saved → chunk → embed via ollama → store in sqlite-vec
2. **Search**: Query → embed via ollama → KNN search in sqlite-vec → return results

---

## Technology Decisions

### sqlite-vec
[github.com/asg017/sqlite-vec](https://github.com/asg017/sqlite-vec)

- SQLite extension for vector search
- Fits our SQLite-first architecture
- No external service
- Supports multiple distance metrics (L2, cosine, dot)
- Production-ready (used by several companies)

**Installation:**
```bash
npm install sqlite-vec
# or load as SQLite extension
```

### ollama
[ollama.com](https://ollama.com)

- Local LLM runner
- Easy model management
- REST API for embeddings
- No API keys, no costs, works offline

**Embedding Models (ranked by quality/speed tradeoff):**

| Model | Dimensions | Speed | Quality | Notes |
|-------|-----------|-------|---------|-------|
| nomic-embed-text | 768 | Fast | Good | Best balance |
| mxbai-embed-large | 1024 | Medium | Better | More accurate |
| all-minilm | 384 | Fastest | Okay | For constrained systems |

**Recommendation:** Start with `nomic-embed-text`, allow config override.

---

## Database Schema

```sql
-- Vector storage table
CREATE VIRTUAL TABLE vec_documents USING vec0(
  embedding float[768]  -- Match model dimensions
);

-- Metadata table (links vectors to documents)
CREATE TABLE doc_embeddings (
  id INTEGER PRIMARY KEY,
  doc_path TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  vec_rowid INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(doc_path, chunk_index)
);

-- Index for fast lookups
CREATE INDEX idx_doc_path ON doc_embeddings(doc_path);
```

---

## Chunking Strategy

Documents need to be chunked for embedding (models have token limits).

**Strategy: Semantic chunking**
1. Split by markdown headers (h1, h2, h3)
2. If section > 512 tokens, split by paragraphs
3. If paragraph > 512 tokens, split by sentences
4. Overlap: 50 tokens between chunks for context

**Chunk metadata:**
```typescript
interface Chunk {
  docPath: string;
  chunkIndex: number;
  text: string;
  header?: string;      // Parent header for context
  startLine: number;
  endLine: number;
}
```

---

## API Design

### New MCP Tools

```typescript
// Semantic search across all documents
tool: "semantic_search"
params: {
  query: string;         // Natural language query
  limit?: number;        // Max results (default: 10)
  threshold?: number;    // Min similarity (default: 0.7)
  planId?: string;       // Scope to specific plan
}
returns: {
  results: Array<{
    docPath: string;
    chunkText: string;
    similarity: number;  // 0-1
    header?: string;
    lineRange: [number, number];
  }>;
}

// Find similar documents
tool: "find_similar"
params: {
  docPath: string;       // Source document
  limit?: number;
}
returns: {
  similar: Array<{
    docPath: string;
    similarity: number;
    preview: string;
  }>;
}

// Reindex (manual trigger)
tool: "reindex_vectors"
params: {
  force?: boolean;       // Reindex everything
  path?: string;         // Reindex specific path
}
```

### CLI Commands

```bash
limps search "authentication flow"     # Semantic search
limps similar plans/0001/plan.md       # Find similar docs
limps reindex                          # Rebuild vector index
limps index-status                     # Show indexing stats
```

---

## Implementation Plan

### Phase 1: Foundation
- [ ] Add sqlite-vec dependency
- [ ] Create vector tables
- [ ] Add ollama client
- [ ] Basic embedding pipeline

### Phase 2: Indexing
- [ ] Document chunking
- [ ] Automatic re-indexing on file change
- [ ] Batch embedding (efficient API usage)
- [ ] Index status tracking

### Phase 3: Search
- [ ] `semantic_search` tool
- [ ] `find_similar` tool
- [ ] CLI commands
- [ ] Result ranking/scoring

### Phase 4: Optimization
- [ ] Embedding cache (don't re-embed unchanged chunks)
- [ ] Incremental updates
- [ ] Background indexing
- [ ] Query caching

---

## Configuration

```json
{
  "semantic": {
    "enabled": true,
    "ollamaUrl": "http://localhost:11434",
    "model": "nomic-embed-text",
    "chunkSize": 512,
    "chunkOverlap": 50,
    "similarityThreshold": 0.7,
    "autoIndex": true,
    "indexOnStartup": false
  }
}
```

---

## Performance Considerations

| Operation | Expected Time | Notes |
|-----------|---------------|-------|
| Embed single chunk | ~50ms | ollama local |
| Index full plan (10 agents) | ~2s | Batched |
| Search query | <100ms | sqlite-vec is fast |
| Full reindex (100 docs) | ~30s | Background task |

**Memory:** sqlite-vec stores vectors on disk, minimal RAM impact.

---

## Graceful Degradation

If ollama isn't running:
1. Log warning, don't crash
2. Disable semantic search tools
3. Fall back to FTS5 for search
4. Queue indexing for when ollama available

```typescript
try {
  await ollama.embed(text);
} catch (e) {
  if (e.code === 'ECONNREFUSED') {
    log.warn('ollama not available, semantic search disabled');
    return fallbackToFTS5(query);
  }
  throw e;
}
```

---

## Testing Strategy

| Test Type | Coverage |
|-----------|----------|
| Unit | Chunking logic, embedding pipeline |
| Integration | ollama connection, sqlite-vec queries |
| E2E | Full search flow |
| Benchmark | Indexing speed, search latency |

**Test fixtures:**
- Sample plans with known relationships
- Edge cases (empty docs, huge docs, special chars)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| ollama not installed | HIGH | Clear error message, setup guide |
| Wrong model downloaded | MEDIUM | Auto-pull correct model |
| Large codebase slow to index | MEDIUM | Background indexing, progress indicator |
| Vector dimension mismatch | HIGH | Validate model on startup |

---

## Success Criteria

- [ ] "auth flow" finds "login implementation"
- [ ] "find similar" returns conceptually related docs
- [ ] <100ms search latency
- [ ] Works fully offline
- [ ] Graceful fallback when ollama unavailable
- [ ] <1MB vector storage per 100 docs

---

## References

- [sqlite-vec docs](https://alexgarcia.xyz/sqlite-vec/)
- [ollama embedding API](https://github.com/ollama/ollama/blob/main/docs/api.md#generate-embeddings)
- [nomic-embed-text](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- [Chunking strategies](https://www.pinecone.io/learn/chunking-strategies/)

---

## Status

Status: Planning
Work Type: feature
Created: 2026-01-26
