# CLI Reference: `limps graph`

Knowledge graph commands for querying and managing the plan entity graph.

## `limps graph reindex`

Rebuild the knowledge graph from plan files.

```bash
limps graph reindex [options]
  --plan <id>        Filter to specific plan ID
  --incremental      Skip unchanged files
  --json             Output as JSON
  --project <name>   Registered project name
```

**Examples:**
```bash
limps graph reindex
limps graph reindex --plan 0042
limps graph reindex --json
```

## `limps graph health`

Show graph statistics and conflict summary.

```bash
limps graph health [options]
  --json             Output as JSON
  --project <name>   Registered project name
```

## `limps graph search`

Search entities in the knowledge graph.

```bash
limps graph search <query> [options]
  --top <k>          Number of results (default: 10)
  --recipe <name>    Search recipe (e.g. LEXICAL_FIRST, SEMANTIC_FIRST)
  --json             Output as JSON
```

**Examples:**
```bash
limps graph search "auth"
limps graph search "plan 0042" --top 5
limps graph search "auth" --recipe LEXICAL_FIRST --json
```

## `limps graph trace`

Trace entity relationships.

```bash
limps graph trace <entity> [options]
  --direction <dir>  up | down | both (default: both)
  --depth <n>        Max traversal depth (default: 2)
  --json             Output as JSON
```

**Examples:**
```bash
limps graph trace plan:0042
limps graph trace agent:0042#003 --direction up
```

## `limps graph entity`

Show details for a specific entity.

```bash
limps graph entity <canonical-id> [options]
  --json             Output as JSON
```

## `limps graph overlap`

Find overlapping features using entity resolution.

```bash
limps graph overlap [options]
  --plan <id>        Filter to specific plan
  --threshold <n>    Similarity threshold (0-1)
  --json             Output as JSON
```

## `limps graph check`

Run conflict detection checks.

```bash
limps graph check [type] [options]
  --json             Output as JSON
```

Types: `file_contention`, `feature_overlap`, `circular_dependency`, `stale_wip`

Exit code 2 if conflicts are found (useful for CI).

## `limps graph suggest`

Get graph-based suggestions.

```bash
limps graph suggest <type> [options]
  --json             Output as JSON
```

Types:
- `consolidate` - Find duplicate/similar features to merge
- `next-task` - Suggest next tasks based on graph analysis

## `limps graph watch`

Watch for file changes and update graph incrementally.

```bash
limps graph watch [options]
  --channels <list>    Notification channels (log,file,webhook)
  --webhook-url <url>  Webhook URL for notifications
```

**Examples:**
```bash
limps graph watch
limps graph watch --channels log,webhook --webhook-url http://localhost:3000/hooks
```
