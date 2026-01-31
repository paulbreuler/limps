---
title: Proactive Conflict Detection (Watch Mode)
status: GAP
persona: coder
depends: [001, 002]
files: [src/health/conflicts.ts, src/health/watcher.ts, src/cli/commands/graph/health.ts, src/cli/commands/graph/watch.ts]
tags: [limps/agent, watch-mode, conflict-detection, proactive]
---

# Agent 003: Proactive Conflict Detection (Watch Mode)

## Overview

The key differentiator: **system detects conflicts WITHOUT being asked.** File watcher + periodic checks surface problems proactively.

Instead of:
```
User: "Are there any conflicts?"
AI: *thinks* *calls tools* *maybe finds something*
```

We get:
```
[File saved]
System: ⚠️ CONFLICT: Plan 0033 Agent 002 and Plan 0041 Agent 001 both modify auth.ts
```

## Acceptance Criteria

- [ ] `limps graph health` runs all conflict detectors
- [ ] `limps graph watch` starts file watcher daemon
- [ ] File changes trigger incremental reindex + conflict check within 2s
- [ ] Notifications via stdout, file, or webhook
- [ ] Conflict types: file overlap, feature duplicate, circular dep, stale WIP, orphan dep

## Technical Specification

### Conflict Types

| Conflict | Detection | Severity | Auto-notify? |
|----------|-----------|----------|--------------|
| File overlap (GAP+GAP) | Two GAP agents list same file | `info` | No |
| File overlap (WIP+GAP) | WIP + GAP on same file | `warning` | Optional |
| File overlap (WIP+WIP) | Two WIP agents on same file | `critical` | Yes |
| Feature duplicate | SIMILAR_TO score > 0.85 | `warning` | Yes |
| Circular dependency | Graph cycle detection | `critical` | Yes |
| Orphan dependency | Depends on non-existent agent | `critical` | Yes |
| Stale WIP | WIP, no update in 7+ days | `warning` | Optional |
| Stale WIP (critical) | WIP, no update in 14+ days | `critical` | Yes |

### Conflict Detector

```typescript
// src/health/conflicts.ts

interface Conflict {
  type: ConflictType;
  severity: 'info' | 'warning' | 'critical';
  entities: Entity[];
  message: string;
  recommendation: string;
}

export async function detectConflicts(
  storage: GraphStorage,
  scope?: { planId?: string; filePath?: string }
): Promise<Conflict[]> {
  const conflicts: Conflict[] = [];
  
  // File overlap detection
  conflicts.push(...await detectFileOverlap(storage, scope));
  
  // Feature duplicates (from SIMILAR_TO relationships)
  conflicts.push(...await detectFeatureDuplicates(storage, scope));
  
  // Circular dependencies
  conflicts.push(...await detectCircularDeps(storage, scope));
  
  // Orphan dependencies
  conflicts.push(...await detectOrphanDeps(storage, scope));
  
  // Stale WIP
  conflicts.push(...await detectStaleWip(storage, scope));
  
  return conflicts;
}

async function detectFileOverlap(storage: GraphStorage, scope?: Scope): Promise<Conflict[]> {
  // Find all MODIFIES relationships
  const modifies = await storage.findRelationships({ type: 'MODIFIES' });
  
  // Group by file
  const byFile = groupBy(modifies, r => r.target.canonical_id);
  
  const conflicts: Conflict[] = [];
  for (const [file, rels] of Object.entries(byFile)) {
    if (rels.length < 2) continue;
    
    const agents = rels.map(r => r.source);
    const statuses = agents.map(a => a.metadata.status);
    
    // Determine severity
    const wipCount = statuses.filter(s => s === 'WIP').length;
    let severity: Severity;
    
    if (wipCount >= 2) {
      severity = 'critical';
    } else if (wipCount === 1) {
      severity = 'warning';
    } else {
      severity = 'info';
    }
    
    conflicts.push({
      type: 'file_overlap',
      severity,
      entities: agents,
      message: `${agents.length} agents modify ${file}`,
      recommendation: severity === 'critical' 
        ? 'Sequence work or consolidate into single plan'
        : 'Consider sequencing work via dependencies'
    });
  }
  
  return conflicts;
}
```

### File Watcher

```typescript
// src/health/watcher.ts

import { watch } from 'chokidar';

interface WatcherOptions {
  onConflict: 'log' | 'notify' | 'webhook';
  webhookUrl?: string;
  minSeverity: Severity;
  debounceMs: number;
}

export function startWatcher(
  plansDir: string,
  storage: GraphStorage,
  options: WatcherOptions
): () => void {
  const watcher = watch(`${plansDir}/**/*.md`, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500 }
  });
  
  const handleChange = debounce(async (path: string) => {
    // 1. Incremental reindex
    await reindexFile(path, storage);
    
    // 2. Run conflict detection
    const conflicts = await detectConflicts(storage, { filePath: path });
    
    // 3. Filter by severity
    const relevant = conflicts.filter(c => 
      severityLevel(c.severity) >= severityLevel(options.minSeverity)
    );
    
    // 4. Notify
    for (const conflict of relevant) {
      await notify(conflict, options);
    }
  }, options.debounceMs);
  
  watcher.on('change', handleChange);
  watcher.on('add', handleChange);
  
  // Return cleanup function
  return () => watcher.close();
}
```

### CLI Commands

```bash
# One-shot health check
limps graph health
# Output:
# ⚠️  CONFLICT [critical]: File contention
#     Plan 0033 Agent 002 (Auth Refactor) - WIP
#     Plan 0041 Agent 001 (Auth Improvements) - WIP
#     Both modify: src/auth.ts
#     Recommendation: Sequence work or consolidate
#
# ⚠️  OVERLAP [warning]: Similar features
#     "Staleness Detection" (Plan 0033) 
#     "Health Check System" (Plan 0041)
#     Similarity: 85%
#
# ✓  No circular dependencies
# ✓  No orphan dependencies
# 
# Summary: 1 critical, 1 warning, 0 info

# Scoped to plan
limps graph health --plan 0041

# Filter by severity
limps graph health --severity warning

# JSON output for scripting
limps graph health --json

# Watch mode (foreground)
limps graph watch

# Watch mode (daemon)
limps graph watch --daemon

# Watch with webhook notification
limps graph watch --on-conflict webhook --url https://...

# Watch with desktop notification
limps graph watch --on-conflict notify
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/health/conflicts.ts` | Create | Conflict detection logic |
| `src/health/watcher.ts` | Create | File watcher |
| `src/health/notify.ts` | Create | Notification handlers |
| `src/cli/commands/graph/health.ts` | Create | CLI command |
| `src/cli/commands/graph/watch.ts` | Create | CLI command |

## Performance Requirements

- Conflict detection: <200ms
- File change to notification: <2s
- Watch mode CPU overhead: <5% idle
