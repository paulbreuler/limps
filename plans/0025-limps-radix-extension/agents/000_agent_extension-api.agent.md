---
title: Extension API & Scaffolding
status: PASS
persona: coder
dependencies: []
tags: [limps/agent, limps/status/pass, limps/persona/coder]
aliases: ["#000", "Extension API Agent"]
created: 2026-01-26
updated: 2026-01-27
files:
  - path: packages/limps/src/extensions/types.ts
    action: create
    repo: limps
  - path: packages/limps/src/extensions/loader.ts
    action: create
    repo: limps
  - path: packages/limps/src/extensions/context.ts
    action: create
    repo: limps
  - path: packages/limps/src/server.ts
    action: modify
    repo: limps
  - path: packages/limps-headless/package.json
    action: create
    repo: limps-radix
  - path: packages/limps-headless/tsconfig.json
    action: create
    repo: limps-radix
  - path: packages/limps-headless/src/index.ts
    action: create
    repo: limps-radix
  - path: packages/limps-headless/src/types/index.ts
    action: create
    repo: limps-radix
---

# Agent 000: Extension API & Scaffolding

**Plan Location**: `plans/0025-limps-radix-extension/0025-limps-radix-extension-plan.md`

## Scope

Features: #0 (limps extension API), #1 (project scaffolding)
Own: Extension system in limps, package structure in limps-radix
Depend on: Nothing
Block: All other agents

## Critical Context

This agent works in TWO repos:
1. **limps** - Add extension loading system
2. **limps-radix** - Create the extension package

## Interfaces

### Export (to limps)

```typescript
// packages/limps/src/extensions/types.ts
export interface LimpsExtension {
  name: string;
  version: string;
  tools: Tool[];
  resources?: Resource[];
  onInit?(context: ExtensionContext): Promise<void>;
  onShutdown?(): Promise<void>;
}

export interface ExtensionContext {
  dataDir: string;
  config: Record<string, unknown>;
  logger: Logger;
}
```

### Export (from limps-radix)

```typescript
// Default export
const limpsRadix: LimpsExtension = {
  name: 'limps-radix',
  version: '0.1.0',
  tools: [], // Added by later agents
  async onInit(context) {
    // Initialize cache directory
  }
};
export default limpsRadix;

// Re-export types
export * from './types/index.js';
```

---

## Features

### #0: limps Extension API

TL;DR: Add extension loading to limps so limps-radix can register tools
Status: `PASS`
Repo: `limps`

TDD:
1. `LimpsExtension interface exists` → add types.ts → export from package
2. `loadExtensions imports from config` → dynamic import → handle missing
3. `extension tools merged into server` → modify server.ts → test tool list
4. `onInit receives context` → create context with dataDir → verify hook called

Gotchas:
- Dynamic import needs ESM: use `await import()`
- dataDir: `~/.limps/extensions/{name}/`
- Config from `limps.config.json` under extension name key

### #1: Project Scaffolding

TL;DR: Create @sudosandwich/limps-radix npm package structure
Status: `PASS`
Repo: `limps-radix` (new)

TDD:
1. `package.json valid` → create with peer dep limps ^2.0.0 → verify fields
2. `default export is LimpsExtension` → create index.ts → verify shape
3. `tsup builds dist/` → configure tsconfig/tsup → verify output

Key package.json fields:
```json
{
  "name": "@sudosandwich/limps-radix",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "@sudosandwich/limps": "^2.0.0"
  },
  "dependencies": {
    "ts-morph": "^24.0.0",
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

---

## Done

- [x] LimpsExtension interface added to limps
- [x] Extension loader implemented in limps
- [x] Extension config supported in limps.config.json
- [x] limps-radix package created
- [x] Default export is valid LimpsExtension
- [x] Build produces dist/index.js + .d.ts
- [x] Types re-exported
