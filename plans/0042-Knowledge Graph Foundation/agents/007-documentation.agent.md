---
title: Documentation
status: GAP
persona: coder
depends: [000, 001, 002, 003, 004, 005, 006]
files: [docs/knowledge-graph.md, docs/cli-reference.md, README.md]
tags: [docs, integration]
---

# Agent 007: Documentation

## Objective

Document the system-intelligent architecture, CLI reference, and integration with Plan 0028 (Obsidian).

## Tasks

### 1. Architecture Overview (`docs/knowledge-graph.md`)

```markdown
# Knowledge Graph Architecture

## Philosophy: System-Intelligent, Not AI-Intelligent

limps uses a knowledge graph to track relationships between plans, agents, features, and files.
The key principle: **the system is smart, not the AI**.

### What This Means

| AI-Dependent (Wrong) | System-Intelligent (Right) |
|---------------------|---------------------------|
| AI decides which tool to call | System routes deterministically |
| AI reasons about retrieval | Regex patterns select strategy |
| AI asks "are there conflicts?" | System surfaces conflicts proactively |
| LLM extracts entities | Regex + lightweight NLP extracts |

### Architecture

```
File changes → Auto-index → Conflict detection → Notify (no query needed)

User query → Deterministic router → Hybrid retrieval → AI formats output
```

### Interface Hierarchy

```
CLI (source of truth)
├── MCP (wrapper for AI that can't shell out)
└── Obsidian Plugin (human UI, wraps CLI)
```

## Entity Types

- **plan**: A feature plan (e.g., `plan:0042`)
- **agent**: A task within a plan (e.g., `agent:0042#003`)
- **feature**: A feature within a plan (e.g., `feature:0042#1`)
- **file**: A source file (e.g., `file:src/auth.ts`)
- **tag**: A tag (e.g., `tag:knowledge-graph`)
- **concept**: An extracted concept (e.g., `concept:authentication`)

## Relationship Types

- **CONTAINS**: plan → agent, plan → feature
- **DEPENDS_ON**: agent → agent
- **MODIFIES**: agent → file
- **IMPLEMENTS**: agent → feature
- **SIMILAR_TO**: feature → feature (with confidence score)
- **BLOCKS**: derived inverse of DEPENDS_ON

## Conflict Detection

| Conflict | Severity | Description |
|----------|----------|-------------|
| File contention (2 WIP) | Critical | Two WIP agents modify same file |
| File contention (WIP + GAP) | Warning | WIP and GAP agents will modify same file |
| Feature overlap (>85%) | Warning | Features are very similar |
| Circular dependency | Critical | A → B → C → A |
| Stale WIP (>14 days) | Critical | Agent stuck in WIP |
| Stale WIP (>7 days) | Warning | Agent possibly stuck |

## Hybrid Retrieval

Queries are routed deterministically based on patterns:

| Pattern | Strategy | Example |
|---------|----------|---------|
| `plan \d+`, `agent #\d+` | Lexical first | "plan 0042" |
| `depends`, `blocks`, `modifies` | Graph first | "what blocks 003" |
| `how`, `why`, `explain` | Semantic first | "explain auth flow" |
| `status`, `progress` | Graph + Lexical | "status of plan 41" |

Results are fused using Reciprocal Rank Fusion (RRF).
```

### 2. CLI Reference (`docs/cli-reference.md`)

```markdown
# CLI Reference

## Graph Commands

### `limps graph reindex`

Reindex knowledge graph from plan files.

```bash
limps graph reindex              # Full reindex
limps graph reindex --plan 0042  # Single plan
limps graph reindex --incremental # Only changed files
```

### `limps graph health`

Run full health check.

```bash
limps graph health        # Human-readable
limps graph health --json # JSON output
```

### `limps graph watch`

Watch for changes and detect conflicts.

```bash
limps graph watch                     # Log conflicts
limps graph watch --on-conflict notify # Desktop notification
limps graph watch --on-conflict webhook --url http://...
```

### `limps graph search <query>`

Hybrid search across knowledge graph.

```bash
limps graph search "authentication"
limps graph search "plan 0042" --top 20
limps graph search "what modifies auth.ts" --json
```

### `limps graph trace <entity>`

Trace dependencies.

```bash
limps graph trace agent:0042#003
limps graph trace agent:0042#003 --direction up --depth 5
limps graph trace file:src/auth.ts --json
```

### `limps graph entity <id>`

Inspect entity details.

```bash
limps graph entity plan:0042
limps graph entity agent:0042#003
limps graph entity file:src/auth.ts
```

### `limps graph overlap`

Find similar features.

```bash
limps graph overlap
limps graph overlap --plan 0042
limps graph overlap --threshold 0.7
```

### `limps graph check <type>`

Run specific conflict check.

```bash
limps graph check contention
limps graph check overlap
limps graph check dependencies
limps graph check stale
```

### `limps graph suggest <type>`

Get suggestions.

```bash
limps graph suggest consolidate
limps graph suggest next-task --plan 0042
```

## JSON Output

All commands support `--json` for machine-readable output:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-01-31T06:30:00Z",
    "duration_ms": 42
  }
}
```

## Exit Codes

- `0`: Success
- `1`: Error
- `2`: Conflicts found (for CI)
```

### 3. Integration Guide

Add section to README or separate doc:

```markdown
## Integration with Obsidian (Plan 0028)

The Obsidian plugin provides a human UI for the knowledge graph:

1. **Graph View**: Uses Obsidian's native graph view for entity relationships
2. **Sidebar**: Shows `limps graph health` output
3. **Notifications**: Toast on conflicts detected
4. **Command Palette**: Access to CLI commands

The plugin calls CLI under the hood — no separate server needed.

## Integration with MCP

MCP tools are thin wrappers around CLI:

```typescript
// MCP tool "graph_health" is literally:
async function graph_health() {
  return JSON.parse(await exec('limps graph health --json'));
}
```

If you can shell out, use CLI directly. MCP is for AI that can't.

## Integration with Plan 0041 (Semantic Search)

Plan 0041's embeddings are consumed as one component of hybrid retrieval.
The deterministic router decides when to use semantic vs lexical vs graph.
```

## Acceptance Criteria

- [ ] Architecture doc explains system-intelligent philosophy
- [ ] CLI reference covers all commands
- [ ] Integration guide for Obsidian, MCP, Plan 0041
- [ ] Examples for common use cases
- [ ] README updated with graph commands
