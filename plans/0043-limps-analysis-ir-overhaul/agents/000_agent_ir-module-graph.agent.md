# Agent 000: IR + Module Graph

**Plan Location**: `plans/0043-limps-analysis-ir-overhaul/0043-limps-analysis-ir-overhaul-plan.md`

## Scope

Features: #0
Own: `packages/limps-headless/src/analysis/ir/*`, `packages/limps-headless/src/analysis/module-graph.ts`, `packages/limps-headless/src/analysis/ts-program.ts`
Depend on: none
Block: Agent 001 (needs IR types)

## Interfaces

### Export

```typescript
// #0
export interface ComponentIR;
export interface Evidence;
export interface ImportSpec;
export function buildComponentIr(input: BuildIrInput): ComponentIR;
export function createModuleGraph(input: ModuleGraphInput): ModuleGraph;
```

### Receive

```typescript
// none
```

## Features

### #0: Component IR + Module Graph Foundation

TL;DR: Create IR types + builders and a module graph with alias + re-export resolution.
Status: `GAP`
Test IDs: `ir-build`, `module-graph-alias`, `module-graph-reexport`
Files: `packages/limps-headless/src/analysis/ir/types.ts` (create), `packages/limps-headless/src/analysis/ir/build-ir.ts` (create), `packages/limps-headless/src/analysis/module-graph.ts` (create), `packages/limps-headless/src/analysis/ts-program.ts` (create)

TDD:

1. `builds ComponentIR with imports/exports/jsx` -> impl -> refactor
2. `resolves alias imports via tsconfig` -> impl -> refactor
3. `re-export chain is tracked` -> impl -> refactor

Gotchas:

- Use a shared TS Program to avoid perf regressions.
- Keep IR fields optional until evidence passes are integrated.

---

## Done

- [ ] TDD cycles pass
- [ ] Exports match interface
- [ ] Status -> PASS
