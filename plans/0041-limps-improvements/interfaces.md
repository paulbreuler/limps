# Interfaces

**Planned for plan 0041 — not yet implemented.** Current limps only has `search_docs` (full-text), not `semantic_search`, `find_similar`, `query_docs`.

**Note:** `generate_requirements` has been moved to Plan 0042.

## Overview

This plan adds new MCP tools and config fields. All tools are additive and optional. Semantic features gracefully degrade when Ollama is unavailable.

## MCP Tool Signatures

```typescript
// Semantic search — returns relevant chunks by vector similarity
semantic_search(input: {
  query: string;
  limit?: number;          // default: 10
  threshold?: number;      // default: 0.7 (similarity cutoff)
  planId?: string;         // scope to specific plan
  pathPrefix?: string;     // scope to path prefix
}) => {
  results: Array<{
    docPath: string;
    chunkText: string;
    similarity: number;
    header?: string;           // nearest heading for context
    lineRange?: [number, number];
  }>;
  meta: {
    query_latency_ms: number;
    used_semantic: boolean;    // false if fell back to FTS5
  };
}

// Find similar documents — given a doc, find related content
find_similar(input: {
  docPath: string;
  limit?: number;          // default: 5
}) => {
  similar: Array<{
    docPath: string;
    similarity: number;
    preview: string;       // first 200 chars
  }>;
}

// Reindex vectors — rebuild embedding index
reindex_vectors(input: {
  force?: boolean;         // skip hash cache, reindex all
  pathPrefix?: string;     // scope to path prefix
}) => {
  indexed: number;
  skipped: number;
  model_mismatch: boolean; // true if config model differs from stored
  errors: Array<{ path: string; error: string }>;
  latency_ms: number;
}

// Query docs — concise answer with scoped filters (works with or without semantic)
query_docs(input: {
  query: string;
  scope?: {
    planId?: string;
    pathPrefix?: string;
    tags?: string[];
  };
  preferSemantic?: boolean;  // default: true (falls back to FTS5 if unavailable)
}) => {
  answer: string;
  sources: Array<{ path: string; snippet: string }>;
  meta: {
    used_semantic: boolean;
    fallback_reason?: string;  // e.g., "Ollama unavailable"
  };
}
```

## Config Additions

```json
{
  "semantic": {
    "enabled": false,
    "ollamaUrl": "http://localhost:11434",
    "model": "nomic-embed-text",
    "modelDim": 768,
    "chunkSize": 2000,
    "chunkOverlap": 200,
    "similarityThreshold": 0.7,
    "autoIndex": true,
    "indexOnStartup": false,
    "timeoutMs": 5000,
    "maxRetries": 3
  }
}
```

### Config Field Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable semantic search features |
| `ollamaUrl` | string | `http://localhost:11434` | Ollama API endpoint |
| `model` | string | `nomic-embed-text` | Embedding model name |
| `modelDim` | number | `768` | Expected embedding dimension (validated at startup) |
| `chunkSize` | number | `2000` | Max characters per chunk |
| `chunkOverlap` | number | `200` | Character overlap between chunks |
| `similarityThreshold` | number | `0.7` | Minimum similarity for results (0-1) |
| `autoIndex` | boolean | `true` | Auto-index on file changes |
| `indexOnStartup` | boolean | `false` | Full reindex on server start |
| `timeoutMs` | number | `5000` | Ollama request timeout |
| `maxRetries` | number | `3` | Retry count for failed requests |

## Error Responses

When semantic features are unavailable, tools return clear error messages:

```typescript
// When semantic.enabled is false
{ error: "semantic_disabled", message: "Semantic search is disabled. Set semantic.enabled: true in config." }

// When Ollama is not running
{ error: "ollama_unavailable", message: "Cannot connect to Ollama at http://localhost:11434. Is Ollama running?" }

// When model dimensions mismatch
{ error: "model_mismatch", message: "Config model 'nomic-embed-text' (768 dim) doesn't match stored embeddings (1024 dim). Run reindex_vectors with force: true." }
```
