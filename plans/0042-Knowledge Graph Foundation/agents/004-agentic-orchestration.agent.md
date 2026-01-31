---
title: CLI-First Architecture
status: GAP
persona: coder
depends: [000, 001, 002, 003]
files: [src/cli/commands/graph/*.ts, src/mcp/tools/graph/*.ts]
tags: [limps/agent, cli, mcp-wrapper]
---

# Agent 004: CLI-First Architecture

## Overview

**CLI is the source of truth. MCP is a thin wrapper for AI that can't shell out.**

This agent implements all CLI commands for the knowledge graph and creates thin MCP wrappers that delegate to CLI.

## Design Philosophy

```
limps CLI (executes logic)
    ↑
    │ wraps (thin layer, no business logic)
    ↓
MCP Server (exposes CLI to AI that can't shell out)
```

**Why CLI-first?**
1. Testable: CLI commands can be tested in isolation
2. Scriptable: Users can compose commands in shell scripts
3. Debuggable: `--verbose` shows what's happening
4. Universal: Works in terminal, CI, cron, anywhere
5. Composable: MCP tools are just CLI wrappers, no duplication

## What We Removed: Agentic Orchestration

**Previously planned:** LLM-based query routing with ReAct loops.

**Why removed:** "AI is usually wrong about what action to take next. Systems thinking isn't strong."

The LLM's job is to CONSUME results, not NAVIGATE to them. System-intelligent, not AI-intelligent.

## Acceptance Criteria

- [ ] All graph CLI commands implemented
- [ ] All MCP tools are thin wrappers around CLI
- [ ] MCP tools have no business logic (just `exec()` + JSON parse)
- [ ] `--json` flag on all commands for programmatic use
- [ ] `--verbose` flag for debugging

## Technical Specification

### CLI Commands

```bash
# === INDEXING ===
limps graph reindex              # Full reindex
limps graph reindex --plan 0041  # Single plan
limps graph reindex --incremental # Only changed files

# === HEALTH & CONFLICTS ===
limps graph health               # All conflict detectors
limps graph health --plan 0041   # Scope to plan
limps graph health --severity warning
limps graph health --json        # Machine-readable

limps graph watch                # File watcher (foreground)
limps graph watch --daemon       # Background daemon
limps graph watch --on-conflict notify

# === SEARCH & RETRIEVAL ===
limps search "auth improvements"          # Hybrid search
limps search "plan 0041" --strategy lexical
limps search "what blocks 003" --verbose  # Show routing decision
limps search "auth" --top-k 20

# === ENTITY INSPECTION ===
limps graph entity plan:0041     # Show entity + relationships
limps graph entity agent:0041#003
limps graph entity file:src/auth.ts

# === TRAVERSAL ===
limps graph trace 0041#003       # Trace dependencies
limps graph trace 0041#003 --direction up
limps graph trace 0041#003 --depth 5

# === RESOLUTION ===
limps graph resolve              # Run entity resolution
limps graph duplicates           # List SIMILAR_TO relationships
limps graph similar "auth"       # Find similar entities

# === STATS ===
limps graph stats                # Entity/relationship counts
limps graph stats --plan 0041
```

### MCP Wrappers (Thin Layer)

```typescript
// src/mcp/tools/graph/health.ts

import { exec } from 'child_process';

export const graphHealth: MCPTool = {
  name: 'graph_health',
  description: 'Detect conflicts, duplicates, and issues across plans',
  inputSchema: {
    type: 'object',
    properties: {
      planId: { type: 'string', description: 'Optional: scope to specific plan' },
      severity: { type: 'string', enum: ['info', 'warning', 'critical'] }
    }
  },
  handler: async (params) => {
    // Just call CLI - NO BUSINESS LOGIC HERE
    const args = ['graph', 'health', '--json'];
    if (params.planId) args.push('--plan', params.planId);
    if (params.severity) args.push('--severity', params.severity);
    
    const result = await exec(`limps ${args.join(' ')}`);
    return JSON.parse(result.stdout);
  }
};
```

```typescript
// src/mcp/tools/graph/search.ts

export const search: MCPTool = {
  name: 'search',
  description: 'Hybrid search across plans, agents, and features',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      topK: { type: 'number', default: 10 },
      strategy: { type: 'string', enum: ['semantic', 'lexical', 'graph', 'hybrid'] }
    },
    required: ['query']
  },
  handler: async (params) => {
    const args = ['search', `"${params.query}"`, '--json'];
    if (params.topK) args.push('--top-k', String(params.topK));
    if (params.strategy) args.push('--strategy', params.strategy);
    
    const result = await exec(`limps ${args.join(' ')}`);
    return JSON.parse(result.stdout);
  }
};
```

### MCP Tool List

All MCP tools are wrappers around CLI:

| MCP Tool | CLI Command |
|----------|-------------|
| `graph_health` | `limps graph health --json` |
| `graph_reindex` | `limps graph reindex --json` |
| `search` | `limps search --json` |
| `graph_trace` | `limps graph trace --json` |
| `graph_entity` | `limps graph entity --json` |
| `graph_similar` | `limps graph similar --json` |
| `graph_duplicates` | `limps graph duplicates --json` |
| `graph_stats` | `limps graph stats --json` |

### CLI Framework

Use existing CLI framework (likely yargs or commander):

```typescript
// src/cli/commands/graph/index.ts

import { Argv } from 'yargs';

export function registerGraphCommands(yargs: Argv) {
  return yargs
    .command('reindex', 'Rebuild knowledge graph', reindexCommand)
    .command('health', 'Detect conflicts and issues', healthCommand)
    .command('watch', 'Watch for file changes', watchCommand)
    .command('entity <id>', 'Show entity details', entityCommand)
    .command('trace <id>', 'Trace dependencies', traceCommand)
    .command('resolve', 'Run entity resolution', resolveCommand)
    .command('duplicates', 'List similar entities', duplicatesCommand)
    .command('similar <query>', 'Find similar entities', similarCommand)
    .command('stats', 'Show statistics', statsCommand);
}
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/cli/commands/graph/reindex.ts` | Create | Reindex command |
| `src/cli/commands/graph/health.ts` | Create | Health check command |
| `src/cli/commands/graph/watch.ts` | Create | Watch mode command |
| `src/cli/commands/graph/entity.ts` | Create | Entity inspection |
| `src/cli/commands/graph/trace.ts` | Create | Dependency tracing |
| `src/cli/commands/graph/resolve.ts` | Create | Entity resolution |
| `src/cli/commands/graph/stats.ts` | Create | Statistics |
| `src/cli/commands/search.ts` | Modify | Add hybrid search |
| `src/mcp/tools/graph/*.ts` | Create | MCP wrappers |

## Testing

```typescript
describe('CLI Commands', () => {
  it('graph health returns JSON', async () => {
    const result = await exec('limps graph health --json');
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveProperty('conflicts');
    expect(parsed).toHaveProperty('summary');
  });
  
  it('MCP wrapper returns same as CLI', async () => {
    const cliResult = await exec('limps graph health --json');
    const mcpResult = await graphHealth.handler({});
    expect(mcpResult).toEqual(JSON.parse(cliResult.stdout));
  });
});
```
