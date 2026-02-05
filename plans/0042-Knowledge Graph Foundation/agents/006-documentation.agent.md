---
title: MCP Wrappers
status: GAP
persona: coder
depends_on: [005]
files: [src/mcp/tools/graph.ts]
tags: [mcp, wrapper, thin]
---

# Agent 006: MCP Wrappers

## Objective

Create thin MCP wrappers around CLI commands. **MCP tools are just `exec('limps ...')`.**

## Context

```
MCP exists for tools that can't shell out.
If you're in a terminal, use CLI directly.
MCP is overhead when `limps graph health` does the same thing.
```

The MCP tools should be **thin wrappers** with no business logic. All intelligence lives in CLI.

## Tasks

### 1. Tool Definitions (`src/mcp/tools/graph.ts`)

```typescript
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const graphTools = {
  
  graph_health: {
    name: 'graph_health',
    description: 'Run health check on knowledge graph. Detects file contention, feature overlap, circular dependencies, stale WIP.',
    inputSchema: z.object({}),
    handler: async () => {
      const { stdout } = await execAsync('limps graph health --json');
      return JSON.parse(stdout);
    },
  },
  
  graph_search: {
    name: 'graph_search',
    description: 'Hybrid search across knowledge graph. Deterministically routes to lexical/semantic/graph retrieval.',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
      top: z.number().optional().default(10).describe('Number of results'),
    }),
    handler: async ({ query, top }) => {
      const { stdout } = await execAsync(`limps graph search "${query}" --top ${top} --json`);
      return JSON.parse(stdout);
    },
  },
  
  graph_trace: {
    name: 'graph_trace',
    description: 'Trace dependencies from an entity (plan, agent, file).',
    inputSchema: z.object({
      entity: z.string().describe('Entity canonical ID (e.g., agent:0042#003)'),
      direction: z.enum(['up', 'down', 'both']).optional().default('both'),
      depth: z.number().optional().default(3),
    }),
    handler: async ({ entity, direction, depth }) => {
      const { stdout } = await execAsync(`limps graph trace "${entity}" --direction ${direction} --depth ${depth} --json`);
      return JSON.parse(stdout);
    },
  },
  
  graph_entity: {
    name: 'graph_entity',
    description: 'Get details about a specific entity and its relationships.',
    inputSchema: z.object({
      id: z.string().describe('Entity canonical ID'),
    }),
    handler: async ({ id }) => {
      const { stdout } = await execAsync(`limps graph entity "${id}" --json`);
      return JSON.parse(stdout);
    },
  },
  
  graph_overlap: {
    name: 'graph_overlap',
    description: 'Find similar/duplicate features across plans.',
    inputSchema: z.object({
      plan: z.string().optional().describe('Filter to specific plan'),
      threshold: z.number().optional().default(0.8).describe('Similarity threshold (0-1)'),
    }),
    handler: async ({ plan, threshold }) => {
      let cmd = `limps graph overlap --threshold ${threshold} --json`;
      if (plan) cmd += ` --plan ${plan}`;
      const { stdout } = await execAsync(cmd);
      return JSON.parse(stdout);
    },
  },
  
  graph_reindex: {
    name: 'graph_reindex',
    description: 'Reindex knowledge graph from plan files.',
    inputSchema: z.object({
      plan: z.string().optional().describe('Reindex specific plan only'),
      incremental: z.boolean().optional().default(false).describe('Only reindex changed files'),
    }),
    handler: async ({ plan, incremental }) => {
      let cmd = 'limps graph reindex --json';
      if (plan) cmd += ` --plan ${plan}`;
      if (incremental) cmd += ' --incremental';
      const { stdout } = await execAsync(cmd);
      return JSON.parse(stdout);
    },
  },
  
  graph_check: {
    name: 'graph_check',
    description: 'Run specific conflict check (contention, overlap, dependencies, stale).',
    inputSchema: z.object({
      type: z.enum(['contention', 'overlap', 'dependencies', 'stale']),
    }),
    handler: async ({ type }) => {
      const { stdout } = await execAsync(`limps graph check ${type} --json`);
      return JSON.parse(stdout);
    },
  },
  
  graph_suggest: {
    name: 'graph_suggest',
    description: 'Get suggestions (consolidate plans, next task).',
    inputSchema: z.object({
      type: z.enum(['consolidate', 'next-task']),
      plan: z.string().optional().describe('Plan ID for next-task'),
    }),
    handler: async ({ type, plan }) => {
      let cmd = `limps graph suggest ${type} --json`;
      if (plan) cmd += ` --plan ${plan}`;
      const { stdout } = await execAsync(cmd);
      return JSON.parse(stdout);
    },
  },
};
```

### 2. Register Tools

```typescript
// In MCP server initialization
import { graphTools } from './tools/graph';

for (const [name, tool] of Object.entries(graphTools)) {
  server.registerTool(tool);
}
```

### 3. Error Handling

```typescript
async function wrapCLI(command: string): Promise<any> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000, // 30s timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    
    if (stderr) {
      console.warn(`CLI stderr: ${stderr}`);
    }
    
    return JSON.parse(stdout);
  } catch (error) {
    if (error.killed) {
      throw new Error('CLI command timed out');
    }
    if (error.code === 'ENOENT') {
      throw new Error('limps CLI not found. Is it installed?');
    }
    throw error;
  }
}
```

## Key Principle

**NO BUSINESS LOGIC IN MCP TOOLS.**

❌ Wrong:
```typescript
handler: async ({ query }) => {
  // DON'T DO THIS
  const strategy = routeQuery(query);  // Business logic!
  const results = await retriever.search(query, strategy);
  return results;
}
```

✅ Right:
```typescript
handler: async ({ query }) => {
  // Just call CLI
  const { stdout } = await execAsync(`limps graph search "${query}" --json`);
  return JSON.parse(stdout);
}
```

## Acceptance Criteria

- [ ] All CLI commands have MCP wrapper
- [ ] Wrappers are <10 lines each (just exec + JSON parse)
- [ ] Error messages are helpful (timeout, not found, etc.)
- [ ] No business logic in MCP layer
- [ ] Works with existing MCP infrastructure
