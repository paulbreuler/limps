# Interfaces

## Overview

This plan adds new MCP tools and config fields. All tools are additive and optional.

## MCP Tool Signatures

```typescript
// Semantic search
semantic_search(input: {
  query: string;
  limit?: number;
  threshold?: number;
  planId?: string;
  pathPrefix?: string;
}) => {
  results: Array<{ docPath: string; chunkText: string; similarity: number; header?: string; lineRange?: [number, number] }>;
}

// Find similar documents
find_similar(input: {
  docPath: string;
  limit?: number;
}) => {
  similar: Array<{ docPath: string; similarity: number; preview: string }>;
}

// Reindex vectors
reindex_vectors(input: {
  force?: boolean;
  pathPrefix?: string;
}) => {
  indexed: number;
  skipped: number;
  errors: Array<{ path: string; error: string }>;
}

// Query docs
query_docs(input: {
  query: string;
  scope?: { planId?: string; pathPrefix?: string; tags?: string[] };
  preferSemantic?: boolean;
}) => {
  answer: string;
  sources: Array<{ path: string; snippet: string }>;
}

// Generate requirements
generate_requirements(input: {
  prompt: string;
  format?: "stories" | "acceptance" | "personas" | "journeys" | "full";
  allow_llm?: boolean;
}) => {
  path: string;
  status: "AI_DRAFT";
}
```

## Config Additions

```json
{
  "semantic": {
    "enabled": false,
    "ollamaUrl": "http://localhost:11434",
    "model": "nomic-embed-text",
    "chunkSize": 900,
    "chunkOverlap": 120,
    "similarityThreshold": 0.7,
    "autoIndex": true,
    "indexOnStartup": false
  }
}
```
