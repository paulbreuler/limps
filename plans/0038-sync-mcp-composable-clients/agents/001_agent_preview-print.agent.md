# Agent 1: Preview/Print + Tests

**Plan Location**: `plans/0038-sync-mcp-composable-clients/0038-sync-mcp-composable-clients-plan.md`

## Scope

Features: #2
Own: `src/cli/config-cmd.ts`, `tests/cli/config-cmd.test.ts`, `tests/cli/commands.test.tsx`
Depend on: Agent 0 for registry API
Block: none

## Interfaces

### Export

```typescript
// #2
export interface PreviewResult { ... }
```

### Receive

```typescript
// #1 (Agent 0) ✅ READY
// getSyncClients()
```

## Features

### #2: Registry-Driven Preview + Print

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
