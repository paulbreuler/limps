# Agent 4: Preview/Print + Tests

**Plan Location**: `plans/0039-llm-usage-improvements/0039-llm-usage-improvements-plan.md`

## Scope

Features: #1b
Own: `src/cli/config-cmd.ts`, `tests/cli/config-cmd.test.ts`, `tests/cli/commands.test.tsx`
Depend on: Agent 0 for registry API
Block: none

## Interfaces

### Export

```typescript
// #1b
export interface PreviewResult { ... }
```

### Receive

```typescript
// #1 (Agent 0) ✅ READY
// getSyncClients()
```

## Features

### #1b: Registry-Driven Preview + Print

TL;DR: Standardize preview/print behavior via registry hooks.
Status: `GAP`
Test IDs: `registry uses preview when available`, `registry selects print format by client`
Files: `src/cli/config-cmd.ts` (modify), `tests/cli/config-cmd.test.ts` (modify), `tests/cli/commands.test.tsx` (modify)

TDD:

1. `registry uses preview when available` → impl → refactor
2. `registry selects print format by client` → impl → refactor

Gotchas:

- Print-only clients should not attempt preview diffs.

---

## Done

- [ ] TDD cycles pass
- [ ] Exports match interface
- [ ] Test IDs implemented
- [ ] Status → PASS

<!-- limps:graph-links:start -->
## LIMPS Graph Links

Plan:
- [Plan](../0039-llm-usage-improvements-plan.md)

Depends on:
_No dependencies found_

Blocks:
_No blocks found_

<!-- limps:graph-links:end -->
