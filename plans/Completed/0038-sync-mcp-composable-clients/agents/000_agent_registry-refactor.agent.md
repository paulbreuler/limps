# Agent 0: Registry + sync-mcp Refactor

**Plan Location**: `plans/0038-sync-mcp-composable-clients/0038-sync-mcp-composable-clients-plan.md`

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

### #1: Client Registry + Hook Interface

TL;DR: Replace sync-mcp conditionals with registry-driven hooks.
Status: `GAP`
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
