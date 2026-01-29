---
title: Differ & Updates
status: PASS
persona: coder
dependencies:
  - "002"
tags: [limps/agent, limps/status/pass, limps/persona/coder]
aliases: ["#005", "Differ Agent"]
created: 2026-01-26
updated: 2026-01-29
files:
  - path: packages/limps-radix/src/differ/props.ts
    action: create
  - path: packages/limps-radix/src/differ/types.ts
    action: create
  - path: packages/limps-radix/src/differ/severity.ts
    action: create
  - path: packages/limps-radix/src/differ/hints.ts
    action: create
  - path: packages/limps-radix/src/differ/index.ts
    action: create
  - path: packages/limps-radix/src/tools/diff-versions.ts
    action: create
  - path: packages/limps-radix/src/tools/check-updates.ts
    action: create
---

# Agent 005: Differ & Updates

**Plan Location**: `plans/0025-limps-radix-extension/0025-limps-radix-extension-plan.md`

## Scope

Features: #13 (Contract Differ), #14 (radix_diff_versions), #15 (radix_check_updates)
Own: `packages/limps-radix/src/differ/`, `packages/limps-radix/src/tools/diff-versions.ts`, `packages/limps-radix/src/tools/check-updates.ts`
Depend on: Agent 002 for extraction/cache
Block: None

## Interfaces

### Export

```typescript
// packages/limps-radix/src/differ/index.ts
export function diffContracts(before: ExtractedPrimitive, after: ExtractedPrimitive): RadixChange[];
export function diffVersions(fromVersion: string, toVersion: string, primitives?: string[]): Promise<RadixDiff>;

// packages/limps-radix/src/tools/diff-versions.ts
export const diffVersionsTool: Tool;

// packages/limps-radix/src/tools/check-updates.ts
export const checkUpdatesTool: Tool;
```

### Receive

```typescript
// From fetcher/extractor (Agent 001)
import { resolveVersion, fetchTypes, listPrimitives } from '../fetcher/index.js';
import { extractPrimitive } from '../extractor/index.js';

// From cache (Agent 002)
import { getFromCache, saveToCache } from '../cache/index.js';
```

---

## Features

### #13: Contract Differ

TL;DR: Detect changes between two ExtractedPrimitive versions
Status: `PASS`

TDD:
1. `detectAddedProps: new prop → info` → set difference → change
2. `detectRemovedProps: missing prop → breaking` → set difference → change
3. `detectRequiredChange: optional→required → breaking` → compare flags
4. `detectTypeNarrowing: union→single → breaking` → parse types
5. `detectTypeWidening: single→union → info` → parse types
6. `generateHint: gives migration advice` → template → hint

Change type classification:
```typescript
// Breaking (will break existing code)
- prop_removed
- prop_required (was optional)
- subcomponent_removed
- type_narrowed ('string | number' → 'string')

// Warning (might cause issues)
- prop_deprecated
- type_changed (not narrowing/widening)
- default_changed

// Info (additive, safe)
- prop_added
- subcomponent_added
- type_widened ('string' → 'string | number')
```

Type analysis approach:
```typescript
function isNarrowing(before: string, after: string): boolean {
  // Simple: count union members
  const beforeMembers = before.split('|').map(s => s.trim());
  const afterMembers = after.split('|').map(s => s.trim());
  return afterMembers.every(m => beforeMembers.includes(m)) 
    && afterMembers.length < beforeMembers.length;
}
```

### #14: radix_diff_versions

TL;DR: Compare two Radix versions
Status: `PASS`

TDD:
1. `diffs all primitives` → loop list → aggregate changes
2. `diffs specific primitives` → filter list → partial diff
3. `breakingOnly filter` → filter severity → only breaking
4. `summary accurate` → count by severity → totals

Tool Schema:
```typescript
{
  name: 'radix_diff_versions',
  description: 'Compare two Radix versions for breaking changes',
  inputSchema: {
    type: 'object',
    properties: {
      fromVersion: { type: 'string' },
      toVersion: { type: 'string', default: 'latest' },
      primitives: { type: 'array', items: { type: 'string' } },
      breakingOnly: { type: 'boolean', default: false }
    },
    required: ['fromVersion']
  }
}
```

Output shape:
```typescript
{
  fromVersion: "1.0.0",
  toVersion: "1.1.0",
  hasBreakingChanges: true,
  summary: { totalChanges: 15, breaking: 2, warnings: 5, info: 8 },
  changes: [
    {
      primitive: "dialog",
      type: "prop_removed",
      severity: "breaking",
      target: "allowPinchZoom",
      before: "boolean",
      after: null,
      description: "Prop 'allowPinchZoom' was removed",
      migration: "Use CSS touch-action instead"
    }
  ]
}
```

### #15: radix_check_updates

TL;DR: Check for new Radix version, auto-diff if found
Status: `PASS`

TDD:
1. `detects update available` → compare cached vs npm → hasUpdate
2. `includes diff when update found` → call differ → include
3. `refreshCache updates signatures` → force extract → update cache
4. `no update returns clean` → same version → minimal output

Tool Schema:
```typescript
{
  name: 'radix_check_updates',
  description: 'Check for new Radix releases and show changes',
  inputSchema: {
    type: 'object',
    properties: {
      refreshCache: { type: 'boolean', default: false }
    }
  }
}
```

Output shape:
```typescript
{
  currentVersion: "1.0.0",
  latestVersion: "1.1.0",
  hasUpdate: true,
  diff: { ... } // RadixDiff if hasUpdate
}
```

---

## Done

- [x] diffContracts detects added/removed props
- [x] Required changes detected (optional → required)
- [x] Type narrowing detected as breaking
- [x] Type widening detected as info
- [x] Migration hints generated
- [x] radix_diff_versions tool registered
- [x] All/specific primitives supported
- [x] breakingOnly filter works
- [x] Summary counts accurate
- [x] radix_check_updates tool registered
- [x] Detects when update available
- [x] Auto-diffs when update found
- [x] refreshCache forces re-extraction
