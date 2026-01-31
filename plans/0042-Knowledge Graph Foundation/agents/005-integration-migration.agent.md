---
title: CLI Interface
status: GAP
persona: coder
depends: [003, 004]
files: [src/cli/commands/graph/index.ts, src/cli/commands/graph/health.ts, src/cli/commands/graph/search.ts, src/cli/commands/graph/trace.ts, src/cli/commands/graph/watch.ts]
tags: [cli, interface, primary]
---

# Agent 005: CLI Interface

## Objective

Build the primary CLI interface. **CLI is the source of truth.** MCP and Obsidian wrap CLI.

## Context

```
limps CLI (the actual intelligence)
    ↑
    │ wraps
    ↓
MCP Server (for AI that can't shell out)
    ↑
    │ also wraps
    ↓
Obsidian Plugin (human UI)
```

All commands output JSON when `--json` flag is passed, making MCP wrapping trivial.

## Tasks

### 1. Command Structure

```
limps graph
├── reindex [--plan <id>] [--incremental]
├── health [--json]
├── check <type> [--json]
├── watch [--on-conflict <target>] [--url <webhook>]
├── search <query> [--top <k>] [--json]
├── trace <entity> [--direction up|down|both] [--depth <n>] [--json]
├── entity <canonical-id> [--json]
├── overlap [--plan <id>] [--threshold <n>] [--json]
└── suggest <type> [--json]
```

### 2. Health Command (`src/cli/commands/graph/health.ts`)

```typescript
import { Command } from 'commander';
import { ConflictDetector } from '../../watch/detector';

export const healthCommand = new Command('health')
  .description('Run full health check on knowledge graph')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const detector = new ConflictDetector(storage);
    const conflicts = detector.detectAll();
    
    if (options.json) {
      console.log(JSON.stringify({ conflicts, stats: storage.getStats() }, null, 2));
      return;
    }
    
    // Human-readable output
    if (conflicts.length === 0) {
      console.log('✅ No conflicts detected');
    } else {
      for (const c of conflicts) {
        const icon = c.severity === 'critical' ? '🚨' : c.severity === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`${icon} ${c.type}: ${c.message}`);
        if (c.suggestion) console.log(`   💡 ${c.suggestion}`);
      }
    }
    
    const stats = storage.getStats();
    console.log(`\n📊 Graph: ${stats.totalEntities} entities, ${stats.totalRelations} relationships`);
  });
```

### 3. Search Command (`src/cli/commands/graph/search.ts`)

```typescript
export const searchCommand = new Command('search')
  .description('Hybrid search across knowledge graph')
  .argument('<query>', 'Search query')
  .option('--top <k>', 'Number of results', '10')
  .option('--json', 'Output as JSON')
  .action(async (query, options) => {
    const retriever = new HybridRetriever(storage, embeddings, fts);
    const results = await retriever.search(query, parseInt(options.top));
    
    if (options.json) {
      console.log(JSON.stringify({ query, results }, null, 2));
      return;
    }
    
    console.log(`🔍 "${query}" (strategy: ${results[0]?.strategy || 'hybrid'})\n`);
    for (const r of results) {
      console.log(`  ${r.entity.type}: ${r.entity.name} (${r.entity.canonicalId})`);
      console.log(`    score: ${r.score.toFixed(3)}`);
    }
  });
```

### 4. Trace Command (`src/cli/commands/graph/trace.ts`)

```typescript
export const traceCommand = new Command('trace')
  .description('Trace dependencies from an entity')
  .argument('<entity>', 'Entity canonical ID (e.g., agent:0042#003)')
  .option('--direction <dir>', 'up (dependencies) | down (dependents) | both', 'both')
  .option('--depth <n>', 'Max traversal depth', '3')
  .option('--json', 'Output as JSON')
  .action(async (entityId, options) => {
    const entity = storage.getEntity(entityId);
    if (!entity) {
      console.error(`Entity not found: ${entityId}`);
      process.exit(1);
    }
    
    const trace = traceEntity(entity, options.direction, parseInt(options.depth));
    
    if (options.json) {
      console.log(JSON.stringify(trace, null, 2));
      return;
    }
    
    // ASCII tree output
    console.log(`📍 ${entity.name} (${entity.canonicalId})`);
    printTree(trace, '  ');
  });

function printTree(node: TraceNode, indent: string): void {
  for (const child of node.children) {
    const rel = child.relation === 'DEPENDS_ON' ? '←' : '→';
    console.log(`${indent}${rel} ${child.entity.name} (${child.entity.canonicalId})`);
    printTree(child, indent + '  ');
  }
}
```

### 5. Watch Command (`src/cli/commands/graph/watch.ts`)

```typescript
export const watchCommand = new Command('watch')
  .description('Watch for changes and detect conflicts')
  .option('--on-conflict <target>', 'log | notify | webhook', 'log')
  .option('--url <url>', 'Webhook URL (if --on-conflict webhook)')
  .option('--interval <ms>', 'Debounce interval', '100')
  .action(async (options) => {
    const watcher = new GraphWatcher(
      plansDir,
      extractor,
      storage,
      detector,
      new Notifier({ target: options.onConflict, webhookUrl: options.url })
    );
    
    watcher.start({ interval: parseInt(options.interval) });
    
    // Keep process alive
    process.on('SIGINT', () => {
      console.log('\n👋 Stopping watcher...');
      watcher.stop();
      process.exit(0);
    });
  });
```

### 6. Other Commands

```typescript
// reindex
limps graph reindex              // Full
limps graph reindex --plan 0042  // Single plan
limps graph reindex --incremental // Only changed

// check (subset of health)
limps graph check contention     // File conflicts
limps graph check overlap        // Feature similarity
limps graph check dependencies   // Circular deps
limps graph check stale          // Stale WIP

// entity inspection
limps graph entity plan:0042
limps graph entity agent:0042#003
limps graph entity file:src/auth.ts

// overlap detection
limps graph overlap
limps graph overlap --plan 0042
limps graph overlap --threshold 0.7

// suggestions
limps graph suggest consolidate   // Suggest plan merges
limps graph suggest next-task --plan 0042
```

### 7. JSON Output Standard

All commands with `--json` return:

```typescript
interface CLIOutput {
  success: boolean;
  data?: any;
  error?: string;
  meta?: {
    timestamp: string;
    duration_ms: number;
  };
}
```

This makes MCP wrapping trivial:

```typescript
// MCP tool is literally:
async function graph_health(params: {}) {
  const result = await exec('limps graph health --json');
  return JSON.parse(result);
}
```

## Acceptance Criteria

- [ ] All commands work standalone
- [ ] `--json` flag on all commands
- [ ] Exit codes: 0 = success, 1 = error, 2 = conflicts found (for CI)
- [ ] Help text for all commands
- [ ] Tab completion support
- [ ] Performance: <100ms startup
