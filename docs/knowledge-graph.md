# Knowledge Graph Architecture

The limps Knowledge Graph provides a structured, queryable representation of plans, agents, features, files, and their relationships. It enables conflict detection, entity resolution, and hybrid search across planning documents.

## Entity Types

| Type | Canonical ID Format | Description |
|------|---------------------|-------------|
| `plan` | `plan:0042` | A plan directory |
| `agent` | `agent:0042#003` | An agent task file |
| `feature` | `feature:0042#1` | A feature within a plan |
| `file` | `file:src/foo.ts` | A source file reference |
| `tag` | `tag:auth` | A tag/label |
| `concept` | `concept:caching` | An abstract concept |

## Relationship Types

| Type | Description | Example |
|------|-------------|---------|
| `CONTAINS` | Parent-child containment | plan CONTAINS agent |
| `DEPENDS_ON` | Dependency relationship | agent DEPENDS_ON agent |
| `MODIFIES` | File modification | agent MODIFIES file |
| `IMPLEMENTS` | Feature implementation | agent IMPLEMENTS feature |
| `SIMILAR_TO` | Similarity relationship | feature SIMILAR_TO feature |
| `BLOCKS` | Blocking relationship | agent BLOCKS agent |
| `TAGGED_WITH` | Tag association | agent TAGGED_WITH tag |

## Conflict Detection

The `ConflictDetector` identifies four types of conflicts:

### File Contention
Multiple WIP agents modifying the same file. Severity: **error**.

### Feature Overlap
Features with SIMILAR_TO relationships at confidence >= 0.85. Severity: **warning**.

### Circular Dependencies
Cycles in the DEPENDS_ON graph detected via DFS. Severity: **error**.

### Stale WIP
Agents with WIP status unchanged for > 7 days (warning) or > 14 days (error).

## Retrieval Pipeline

The hybrid retrieval system combines three channels:

1. **Lexical** - FTS5 full-text search on entity names
2. **Semantic** - Embedding-based similarity (requires embedding store)
3. **Graph** - BFS expansion from seed entities with hop-decay scoring

Results are fused using Reciprocal Rank Fusion (RRF) with configurable weights per recipe.

### Built-in Recipes

- `HYBRID_BALANCED` - Equal weight across channels
- `LEXICAL_FIRST` - Exact entity lookups
- `SEMANTIC_FIRST` - Conceptual exploration
- `EDGE_HYBRID_RRF` - Graph-first for relationship queries
- `NODE_HYBRID_RRF` - Semantic-first with graph support
- `BFS_EXPANSION` - Deep traversal for impact analysis

## Data Flow

```
Plan Files (.md)
    |
    v
EntityExtractor.extractPlan()
    |
    v
GraphStorage (SQLite + FTS5)
    |
    v
HybridRetriever / ConflictDetector / EntityResolver
    |
    v
CLI Commands / MCP Tools
```

## Watch Mode

The `GraphWatcher` monitors plan files for changes and incrementally updates the graph. On settled batches, it runs conflict detection and sends notifications via configured channels (log, file, webhook).
