---
title: Read MCP Tools
status: GAP
persona: coder
dependencies:
  - 002_agent_signatures.agent.md
tags: [limps/agent, limps/status/gap, limps/persona/coder]
aliases: ["#003", "Read Tools Agent"]
created: 2026-01-26
updated: 2026-01-27
files:
  - path: src/tools/list-primitives.ts
    action: create
  - path: src/tools/extract-primitive.ts
    action: create
  - path: src/index.ts
    action: modify
---

# Agent 003: Read MCP Tools

**Plan Location**: `plans/0025-limps-radix-extension/0025-limps-radix-extension-plan.md`

## Scope

Features: #7 (radix_list_primitives), #8 (radix_extract_primitive)
Own: `src/tools/list-primitives.ts`, `src/tools/extract-primitive.ts`
Depend on: Agent 002 for signatures/cache
Block: None directly (but other agents may use these patterns)

## Interfaces

### Export

```typescript
// src/tools/list-primitives.ts
export const listPrimitivesTool: Tool;

// src/tools/extract-primitive.ts
export const extractPrimitiveTool: Tool;
```

### Receive

```typescript
// From fetcher (Agent 001)
import { listPrimitives, fetchTypes, resolveVersion } from '../fetcher/index.js';

// From extractor (Agent 001)
import { extractPrimitive } from '../extractor/index.js';

// From signatures (Agent 002)
import { generateSignature } from '../signatures/index.js';

// From cache (Agent 002)
import { getFromCache, saveToCache } from '../cache/index.js';
```

---

## Features

### #7: radix_list_primitives

TL;DR: List all Radix primitives with metadata
Status: `GAP`

TDD:
1. `tool registered in tools array` → add to index.ts → verify in list
2. `returns primitives for latest` → call fetcher → format output
3. `supports version param` → resolve + list → specific version

Tool Schema:
```typescript
{
  name: 'radix_list_primitives',
  description: 'List all available Radix UI primitives',
  inputSchema: {
    type: 'object',
    properties: {
      version: { 
        type: 'string', 
        description: 'Radix version (default: latest)',
        default: 'latest'
      }
    }
  }
}
```

Output shape:
```typescript
{
  version: "1.1.2",
  primitives: [
    { name: "dialog", package: "@radix-ui/react-dialog" },
    { name: "popover", package: "@radix-ui/react-popover" },
    // ...
  ]
}
```

### #8: radix_extract_primitive

TL;DR: Extract full contract for a specific primitive
Status: `GAP`

TDD:
1. `returns sub-components with props` → extract + format → verify shape
2. `returns behavioral classification` → generate signature → include
3. `uses cache when available` → mock cache hit → no fetch
4. `handles invalid primitive` → catch error → meaningful message

Tool Schema:
```typescript
{
  name: 'radix_extract_primitive',
  description: 'Extract behavioral contract from a Radix primitive',
  inputSchema: {
    type: 'object',
    properties: {
      primitive: { 
        type: 'string', 
        description: 'Primitive name (e.g., "dialog", "popover")'
      },
      version: { 
        type: 'string', 
        default: 'latest'
      }
    },
    required: ['primitive']
  }
}
```

Output shape:
```typescript
{
  primitive: "dialog",
  package: "@radix-ui/react-dialog",
  version: "1.1.2",
  behavior: {
    statePattern: "binary",
    compositionPattern: "compound",
    renderingPattern: "portal-conditional"
  },
  subComponents: [
    {
      name: "Root",
      props: [
        { name: "open", type: "boolean", required: false, category: "state" },
        { name: "onOpenChange", type: "(open: boolean) => void", required: false, category: "event" },
        { name: "modal", type: "boolean", required: false, default: "true", category: "config" }
      ]
    },
    // ...
  ],
  similarTo: ["Popover", "AlertDialog"],
  disambiguationRule: "Look for 'modal' prop or Overlay sub-component"
}
```

---

## Done

- [ ] radix_list_primitives tool defined
- [ ] Tool registered in extension tools array
- [ ] Lists primitives with package names
- [ ] Supports version parameter
- [ ] radix_extract_primitive tool defined
- [ ] Returns sub-components with typed props
- [ ] Props categorized (state/event/config/composition)
- [ ] Behavioral classification included
- [ ] Disambiguation info included
- [ ] Uses cache, falls back to fetch
