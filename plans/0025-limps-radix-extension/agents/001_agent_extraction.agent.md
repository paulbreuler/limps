---
title: Type Fetcher & Extractor
status: PASS
persona: coder
dependencies:
  - "000"
tags: [limps/agent, limps/status/pass, limps/persona/coder]
aliases: ["#001", "Extraction Agent"]
created: 2026-01-26
updated: 2026-01-27
files:
  - path: packages/limps-radix/src/fetcher/npm-registry.ts
    action: create
  - path: packages/limps-radix/src/fetcher/unpkg.ts
    action: create
  - path: packages/limps-radix/src/fetcher/index.ts
    action: create
  - path: packages/limps-radix/src/extractor/project.ts
    action: create
  - path: packages/limps-radix/src/extractor/interface.ts
    action: create
  - path: packages/limps-radix/src/extractor/props.ts
    action: create
  - path: packages/limps-radix/src/extractor/jsdoc.ts
    action: create
  - path: packages/limps-radix/src/extractor/classifier.ts
    action: create
  - path: packages/limps-radix/src/extractor/index.ts
    action: create
---

# Agent 001: Type Fetcher & Extractor

**Plan Location**: `plans/0025-limps-radix-extension/0025-limps-radix-extension-plan.md`

## Scope

Features: #2 (Type Fetcher), #3 (Type Extractor), #4 (Props Classifier)
Own: `packages/limps-radix/src/fetcher/`, `packages/limps-radix/src/extractor/`
Depend on: Agent 000 for package structure
Block: Agent 002 (Signature Generator)

## Interfaces

### Export

```typescript
// packages/limps-radix/src/fetcher/index.ts
export async function resolveVersion(primitive: string, versionHint: string): Promise<string>;
export async function fetchTypes(primitive: string, version: string): Promise<string>;
export async function listPrimitives(version?: string): Promise<string[]>;

// packages/limps-radix/src/extractor/index.ts
export function extractPrimitive(typeContent: string, primitiveName: string): ExtractedPrimitive;

// packages/limps-radix/src/extractor/classifier.ts
export function classifyProp(prop: RawProp): PropDefinition;
```

### Receive

```typescript
// From types (Agent 000)
import type { ExtractedPrimitive, PropDefinition } from '../types/index.js';
```

---

## Features

### #2: Type Fetcher

TL;DR: Fetch Radix .d.ts from npm/unpkg CDN
Status: `PASS`

TDD:
1. `resolveVersion("dialog", "latest") returns semver` → fetch registry.npmjs.org → parse dist-tags
2. `fetchTypes returns .d.ts content` → fetch from unpkg → handle 404
3. `listPrimitives returns array` → parse radix-ui package → filter react-*
4. `handles network errors` → mock failures → meaningful errors

Key URLs:
- Registry: `https://registry.npmjs.org/@radix-ui/react-{primitive}`
- Types: `https://unpkg.com/@radix-ui/react-{primitive}@{version}/dist/index.d.ts`
- Meta: `https://registry.npmjs.org/radix-ui`

Gotchas:
- Some primitives in individual packages, some in radix-ui meta
- "latest" resolution should be cached (short TTL)

### #3: Type Extractor (ts-morph)

TL;DR: Parse .d.ts to extract component contracts
Status: `PASS`

TDD:
1. `ts-morph Project parses string` → create with in-memory file → verify AST
2. `findInterfaces extracts *Props` → getInterfaces() → filter pattern
3. `extractProps gets name, type, required` → getProperties() → getType()
4. `handles interface extends` → resolve base interface → merge props
5. `detects sub-components` → match naming pattern → group

ts-morph patterns:
```typescript
const project = new Project({ useInMemoryFileSystem: true });
const sourceFile = project.createSourceFile('index.d.ts', content);
const interfaces = sourceFile.getInterfaces();
interface.getProperties().forEach(prop => {
  prop.getName();
  prop.getType().getText();
  prop.hasQuestionToken(); // optional?
});
```

### #4: Semantic Props Classifier

TL;DR: Classify props as state/event/config/composition
Status: `PASS`

TDD:
1. `"open" → isStateControl` → pattern match → true
2. `"onOpenChange" → isEventHandler` → match on[A-Z] → true
3. `"asChild" → isComposition` → known list → true
4. `"modal" → isConfiguration` → known list → true

Patterns:
- State: `open`, `value`, `checked`, `pressed`, `defaultOpen`, `defaultValue`
- Events: `/^on[A-Z]/`
- Composition: `asChild`, `children`
- Config: `modal`, `orientation`, `side`, `align`, `loop`, `dir`

---

## Done

- [x] resolveVersion fetches from npm registry
- [x] fetchTypes fetches from unpkg
- [x] listPrimitives returns all Radix primitives
- [x] ts-morph extracts interfaces from .d.ts
- [x] Props extracted with name, type, required
- [x] JSDoc @default values extracted
- [x] Sub-components detected by naming pattern
- [x] Props classified semantically
