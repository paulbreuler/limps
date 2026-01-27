# Agent 2: Docs + CLI Guidance

**Plan Location**: `plans/0039-llm-usage-improvements/0039-llm-usage-improvements-plan.md`

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

### #3: LLM-Focused Setup Guidance

TL;DR: Keep docs/CLI concise and explicit about client constraints.
Status: `GAP`
Test IDs: `README includes client constraints`, `sync output mentions print-only clients`
Files: `README.md` (modify), `src/commands/config/index.tsx` (modify)

TDD:

1. `README includes client constraints` → impl → refactor
2. `sync output mentions print-only clients` → impl → refactor

---

## Done

- [ ] TDD cycles pass
- [ ] Exports match interface
- [ ] Test IDs implemented
- [ ] Status → PASS
