---
title: MVP Release Artifacts
status: GAP
persona: coder
dependencies: []
tags: [limps/agent, limps/status/gap, limps/persona/coder]
aliases: ["#011", "Release Artifacts Agent"]
created: 2026-01-28
updated: 2026-01-28
files:
  - path: packages/limps-radix/LICENSE
    action: create
---

# Agent 011: MVP Release Artifacts

**Plan Location**: `plans/0025-limps-radix-extension/0025-limps-radix-extension-plan.md`

## Scope

Features: #23 (MVP Release Artifacts)
Own: `packages/limps-radix/LICENSE`
Depend on: None (can work in parallel with Agent 010)
Block: None

## Problem

The package.json `files` array specifies `LICENSE` but the file doesn't exist in the package directory. npm publication requires LICENSE file to be present.

## Interfaces

### Export

```typescript
// packages/limps-radix/LICENSE
// MIT License text file (no TypeScript exports)
```

### Receive

```typescript
// No dependencies - standalone file
```

---

## Features

### #23: MVP Release Artifacts

TL;DR: Add LICENSE file and verify package structure
Status: `GAP`

TDD:
1. `LICENSE file exists` → Copy from root LICENSE → Verify MIT content
2. `npm pack includes LICENSE` → Run npm pack --dry-run → Verify files array
3. `dist/ has all files` → Verify build output → Check type definitions

---

## TDD Cycles

### 1. Copy LICENSE file

```bash
# Copy LICENSE from root to package directory
cp LICENSE packages/limps-radix/LICENSE
```

Test: LICENSE file exists in `packages/limps-radix/`
Impl: Copy LICENSE from repository root
Refactor: Verify MIT license content matches

### 2. Verify LICENSE content

```text
MIT License

Copyright (c) 2025 Paul Breuler

Permission is hereby granted, free of charge, to any person obtaining a copy
...
```

Test: LICENSE contains MIT license text
Impl: Verify file content matches root LICENSE
Refactor: Ensure copyright year is correct (2025)

### 3. Verify package.json files array

```json
{
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ]
}
```

Test: package.json files array includes LICENSE
Impl: Verify files array is correct (already set)
Refactor: Ensure all listed files exist

### 4. Verify npm pack output

```bash
npm pack --dry-run
```

Test: npm pack includes dist/, README.md, LICENSE
Impl: Run npm pack --dry-run
Refactor: Verify no unexpected files included

### 5. Verify build output

```bash
npm run build
ls dist/
```

Test: dist/ directory has all compiled files
Impl: Verify dist/ structure matches source
Refactor: Check type definitions (.d.ts) included

---

## Acceptance Criteria

- [ ] LICENSE file exists in `packages/limps-radix/LICENSE`
- [ ] LICENSE contains MIT license text
- [ ] LICENSE matches root LICENSE file exactly
- [ ] npm pack --dry-run includes LICENSE
- [ ] package.json files array is correct
- [ ] dist/ directory has all compiled files
- [ ] Type definitions (.d.ts) are present in dist/

---

## Notes

- LICENSE must be MIT (matches package.json license field)
- File should be identical to root LICENSE
- Copyright year is 2025
- No modifications needed - direct copy from root
- Verify after Agent 010 completes (README.md must exist for npm pack test)
