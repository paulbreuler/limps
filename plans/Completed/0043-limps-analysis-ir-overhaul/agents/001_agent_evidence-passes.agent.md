# Agent 001: Evidence Passes

**Plan Location**: `plans/0043-limps-analysis-ir-overhaul/0043-limps-analysis-ir-overhaul-plan.md`

## Scope

Features: #1
Own: `packages/limps-headless/src/analysis/passes/*`
Depend on: Agent 000 for IR + module graph types
Block: Agent 002 (needs evidence format)

## Interfaces

### Export

```typescript
// #1
export function collectEvidence(ir: ComponentIR, ctx: EvidenceContext): Evidence[];
export function extractImportEvidence(...): Evidence[];
export function extractJsxEvidence(...): Evidence[];
export function extractBehaviorEvidence(...): Evidence[];
```

### Receive

```typescript
// #0 (Agent 000) ✅ READY
// ComponentIR, Evidence, ImportSpec
```

## Features

### #1: Evidence Extraction Passes

TL;DR: Add import, JSX, role/data-attr, and behavior evidence passes with locations.
Status: `PASS`
Test IDs: `evidence-import`, `evidence-role`, `evidence-behavior`
Files: `packages/limps-headless/src/analysis/passes/import-evidence.ts` (create), `packages/limps-headless/src/analysis/passes/jsx-evidence.ts` (create), `packages/limps-headless/src/analysis/passes/behavior-evidence.ts` (create), `packages/limps-headless/src/analysis/passes/index.ts` (create)

TDD:

1. `captures import evidence with locations` -> impl -> refactor
2. `captures role and data-* evidence` -> impl -> refactor
3. `captures behavior heuristics` -> impl -> refactor

Gotchas:

- Evidence should be stable IDs to enable rule matching.
- Behavior heuristics should be conservative to avoid false positives.

---

## Done

- [ ] TDD cycles pass
- [ ] Exports match interface
- [ ] Status -> PASS

<!-- limps:graph-links:start -->
## LIMPS Graph Links

Plan:
- [Plan](../0043-limps-analysis-ir-overhaul-plan.md)

Depends on:
_No dependencies found_

Blocks:
_No blocks found_

<!-- limps:graph-links:end -->
