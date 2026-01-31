---
title: Documentation
status: GAP
persona: coder
depends: [000, 001, 002, 003, 004, 005]
files: [docs/knowledge-graph.md, docs/cli-reference.md, README.md]
tags: [limps/agent, documentation]
---

# Agent 006: Documentation

## Overview

Document the knowledge graph architecture, CLI commands, and integration patterns.

## Acceptance Criteria

- [ ] Architecture overview with diagrams
- [ ] CLI reference with all commands
- [ ] Integration guide for Plans 0028, 0041, 0033, 0030
- [ ] FAQ for common issues
- [ ] README updated

## Documentation Structure

### docs/knowledge-graph.md

```markdown
# Knowledge Graph Architecture

## Philosophy: System-Intelligent, Not AI-Intelligent

The knowledge graph is designed to be smart independent of whatever AI consumes it.

- **AI does NOT decide** what tools to call
- **AI does NOT reason** about retrieval strategy
- **System routes** queries deterministically (regex, not LLM)
- **System detects** conflicts proactively (watch mode)

## Entity Model

### Entity Types

| Type | Example | Description |
|------|---------|-------------|
| `plan` | `plan:0041-semantic` | A feature plan |
| `agent` | `agent:0041#003` | An agent within a plan |
| `feature` | `feature:0041#1` | A feature within a plan |
| `file` | `file:src/auth.ts` | A source file |
| `tag` | `tag:limps/priority/high` | A tag |
| `concept` | `concept:authentication` | A concept extracted from text |

### Relationship Types

| Relation | Source → Target | Example |
|----------|-----------------|---------|
| `CONTAINS` | Plan → Agent | Plan 0041 contains Agent 003 |
| `DEPENDS_ON` | Agent → Agent | Agent 003 depends on Agent 001 |
| `MODIFIES` | Agent → File | Agent 003 modifies `auth.ts` |
| `IMPLEMENTS` | Agent → Feature | Agent implements "hybrid search" |
| `SIMILAR_TO` | Entity → Entity | Auto-created when similarity > 0.8 |
| `BLOCKS` | Agent → Agent | Derived from unsatisfied DEPENDS_ON |

## Hybrid Retrieval

Three retrievers fused via RRF:

1. **Semantic**: Embedding similarity (Plan 0041)
2. **Lexical**: FTS5/BM25 text search
3. **Graph**: Relationship traversal

Query routing is **deterministic** (regex patterns):

| Pattern | Strategy | Weights |
|---------|----------|---------|
| `plan 0041`, `agent #003` | Lexical | L:0.7, G:0.2, S:0.1 |
| `what blocks`, `depends on` | Graph | G:0.6, L:0.2, S:0.2 |
| `how does`, `explain` | Semantic | S:0.6, L:0.2, G:0.2 |
| Default | Hybrid | S:0.4, L:0.3, G:0.3 |

## Proactive Conflict Detection

Watch mode detects conflicts WITHOUT being asked:

- File overlap (WIP+WIP = critical)
- Feature duplicates (>85% similarity)
- Circular dependencies
- Stale WIP agents
- Orphan dependencies

## Interface Hierarchy

```
CLI (source of truth)
  ↓ wraps
MCP (for AI that can't shell out)
  
CLI (source of truth)
  ↓ wraps
Obsidian Plugin (human UI) — see Plan 0028
```
```

### docs/cli-reference.md

```markdown
# CLI Reference

## Graph Commands

### `limps graph reindex`

Rebuild knowledge graph from plan files.

```bash
limps graph reindex              # Full reindex
limps graph reindex --plan 0041  # Single plan
limps graph reindex --incremental # Only changed files
```

### `limps graph health`

Detect conflicts and issues.

```bash
limps graph health               # All checks
limps graph health --plan 0041   # Scope to plan
limps graph health --severity warning
limps graph health --json        # Machine-readable
```

Output example:
```
⚠️  CONFLICT [critical]: File contention
    Plan 0033 Agent 002 (Auth Refactor) - WIP
    Plan 0041 Agent 001 (Auth Improvements) - WIP
    Both modify: src/auth.ts
    Recommendation: Sequence work or consolidate

Summary: 1 critical, 0 warning, 0 info
```

### `limps graph watch`

Watch for file changes and detect conflicts proactively.

```bash
limps graph watch                # Foreground
limps graph watch --daemon       # Background
limps graph watch --on-conflict notify
```

### `limps search`

Hybrid search with deterministic routing.

```bash
limps search "auth improvements"
limps search "plan 0041" --strategy lexical
limps search "what blocks 003" --verbose
```

### `limps graph trace`

Trace dependencies.

```bash
limps graph trace 0041#003
limps graph trace 0041#003 --direction up
limps graph trace 0041#003 --depth 5
```

### `limps graph entity`

Inspect entity details.

```bash
limps graph entity plan:0041
limps graph entity agent:0041#003
limps graph entity file:src/auth.ts
```

### `limps graph stats`

Show statistics.

```bash
limps graph stats
limps graph stats --plan 0041
```
```

### README.md Update

Add section:

```markdown
## Knowledge Graph

limps includes a knowledge graph that enables:

- **Proactive conflict detection** — watch mode surfaces issues automatically
- **Hybrid search** — semantic + lexical + graph, fused via RRF
- **Entity resolution** — detects similar/duplicate features
- **Deterministic routing** — no LLM in the retrieval loop

```bash
# Initialize
limps graph reindex

# Check for issues
limps graph health

# Start watching
limps graph watch --daemon

# Search
limps search "auth improvements"
```

See [Knowledge Graph Architecture](docs/knowledge-graph.md) for details.
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/knowledge-graph.md` | Create | Architecture overview |
| `docs/cli-reference.md` | Modify | Add graph commands |
| `docs/integration.md` | Create | Integration patterns |
| `docs/faq.md` | Create | Common issues |
| `README.md` | Modify | Add knowledge graph section |
