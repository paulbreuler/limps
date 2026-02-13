# Agent 2: Docs + CLI Polish

**Plan Location**: `plans/0038-sync-mcp-composable-clients/0038-sync-mcp-composable-clients-plan.md`

## Scope

Features: #3
Own: `README.md`, `src/commands/config/index.tsx`
Depend on: Agent 0 for registry API
Block: none

## Interfaces

### Export

```typescript
// #3
(none)
```

### Receive

```typescript
// #1 (Agent 0) ✅ READY
// getSyncClients()
```

## Features

### #3: Docs + CLI Usage Updates

TL;DR: Ensure docs/help reflect registry-based behavior.
Status: `GAP`
Test IDs: `help text still lists all clients`
Files: `README.md` (modify), `src/commands/config/index.tsx` (modify)

TDD:

1. `help text still lists all clients` → impl → refactor

---

## Done

- [ ] TDD cycles pass
- [ ] Exports match interface
- [ ] Test IDs implemented
- [ ] Status → PASS

<!-- limps:graph-links:start -->
## LIMPS Graph Links

Plan:
- [Plan](../0038-sync-mcp-composable-clients-plan.md)

Depends on:
_No dependencies found_

Blocks:
_No blocks found_

<!-- limps:graph-links:end -->
