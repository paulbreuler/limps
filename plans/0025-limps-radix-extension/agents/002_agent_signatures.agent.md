---
title: Signature Generator & Cache
status: GAP
persona: coder
dependencies:
  - 001_agent_extraction.agent.md
tags: [limps/agent, limps/status/gap, limps/persona/coder]
aliases: ["#002", "Signatures Agent"]
created: 2026-01-26
updated: 2026-01-27
files:
  - path: src/signatures/inference.ts
    action: create
  - path: src/signatures/distinguishing.ts
    action: create
  - path: src/signatures/disambiguation.ts
    action: create
  - path: src/signatures/generator.ts
    action: create
  - path: src/signatures/index.ts
    action: create
  - path: src/cache/storage.ts
    action: create
  - path: src/cache/ttl.ts
    action: create
  - path: src/cache/index.ts
    action: create
---

# Agent 002: Signature Generator & Cache

**Plan Location**: `plans/0025-limps-radix-extension/0025-limps-radix-extension-plan.md`

## Scope

Features: #5 (Signature Generator), #6 (Cache System)
Own: `src/signatures/`, `src/cache/`
Depend on: Agent 001 for ExtractedPrimitive
Block: Agent 003, 004, 005 (all tools depend on signatures/cache)

## Interfaces

### Export

```typescript
// src/signatures/index.ts
export function generateSignature(extracted: ExtractedPrimitive): BehaviorSignature;
export function inferStatePattern(props: PropDefinition[]): StatePattern;
export function inferCompositionPattern(subComponents: SubComponentDefinition[]): CompositionPattern;

// src/cache/index.ts
export async function getFromCache(primitive: string, version: string): Promise<ExtractedPrimitive | null>;
export async function saveToCache(primitive: string, version: string, data: ExtractedPrimitive): Promise<void>;
export async function getSignatureFromCache(primitive: string, version: string): Promise<BehaviorSignature | null>;
export async function isExpired(cacheEntry: CacheEntry, ttlDays: number): boolean;
```

### Receive

```typescript
// From extractor (Agent 001)
import { extractPrimitive } from '../extractor/index.js';
import type { ExtractedPrimitive, PropDefinition } from '../types/index.js';
```

---

## Features

### #5: Behavior Signature Generator

TL;DR: Transform ExtractedPrimitive → BehaviorSignature
Status: `GAP`

TDD:
1. `inferStatePattern: open/onOpenChange → "binary"` → check prop patterns → return type
2. `inferStatePattern: value/onValueChange with options → "single-value"` → detect select pattern
3. `inferComposition: 3+ sub-components → "compound"` → count children
4. `inferRendering: Portal sub-component → "portal"` → check names
5. `getDistinguishing: Dialog includes "modal"` → cross-primitive analysis
6. `generateDisambiguation: returns rule` → encode known rules

State pattern inference:
- `binary`: open/defaultOpen + onOpenChange
- `single-value`: value + onValueChange (no multi-select)
- `multi-value`: value[] + onValueChange 
- `range`: min, max, step
- `none`: no state props

Distinguishing props (hardcoded initially):
```typescript
const DISTINGUISHING = {
  Dialog: ['modal', 'Overlay'],
  Popover: ['side', 'align', 'sideOffset'],
  Tooltip: ['delayDuration', 'skipDelayDuration'],
  HoverCard: ['openDelay', 'closeDelay'],
  Select: ['Value', 'Viewport', 'ScrollUpButton'],
  DropdownMenu: ['Sub', 'RadioGroup', 'CheckboxItem'],
};
```

### #6: Cache System

TL;DR: Version-aware caching with TTL
Status: `GAP`

TDD:
1. `getFromCache returns null if missing` → check file exists → return null
2. `saveToCache writes JSON` → serialize → write to version dir
3. `isExpired checks TTL` → compare timestamps → boolean
4. `getFromCache returns data if valid` → read + check TTL → return

Cache structure:
```
.limps-radix/
  1.0.5/
    dialog.json        # ExtractedPrimitive
    dialog.sig.json    # BehaviorSignature
    popover.json
    ...
  latest-resolved.json # { "latest": "1.1.2", "resolvedAt": "..." }
```

TTL strategy:
- Versioned extractions: 7 days (version is immutable, but re-extract occasionally)
- "latest" resolution: 1 hour
- Force refresh bypasses both

---

## Done

- [ ] inferStatePattern classifies state props
- [ ] inferCompositionPattern detects compound/monolithic/provider
- [ ] inferRenderingPattern detects portal/inline/conditional
- [ ] Distinguishing props identified for each primitive
- [ ] Disambiguation rules encoded
- [ ] Cache reads/writes to .limps-radix/{version}/
- [ ] TTL expiration works
- [ ] Force refresh bypasses cache
