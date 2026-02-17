# Agent 0: Registry Refactor

**Plan Location**: `plans/0039-llm-usage-improvements/0039-llm-usage-improvements-plan.md`

## Scope

Features: #1
Own: `src/cli/mcp-clients.ts`, `src/commands/config/sync-mcp.tsx`
Depend on: none
Block: Agents 1–2 waiting on registry API

## Interfaces

### Export

```typescript
// #1
export function getSyncClients(): McpSyncClient[];
```

### Receive

```typescript
// None
```

## Features

### #1: Composable Client Registry

TL;DR: Replace sync-mcp conditionals with a registry-driven flow.
Status: `PASS`
Test IDs: `sync-mcp uses registry for iteration`, `print-only client does not write files`
Files: `src/cli/mcp-clients.ts` (create), `src/commands/config/sync-mcp.tsx` (modify)

TDD:

1. `sync-mcp uses registry for iteration` → impl → refactor
2. `print-only client does not write files` → impl → refactor

Gotchas:

- Preserve output order for deterministic diffs.

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
