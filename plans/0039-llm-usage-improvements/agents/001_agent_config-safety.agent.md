# Agent 1: Config Safety + Errors

**Plan Location**: `plans/0039-llm-usage-improvements/0039-llm-usage-improvements-plan.md`

## Scope

Features: #2
Own: `src/cli/config-cmd.ts`, `tests/cli/config-cmd.test.ts`
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

### #2: Safer Config Writes + Better Errors

TL;DR: Fail safely on invalid server sections and surface missing configs.
Status: `PASS`
Test IDs: `reject non-object servers section`, `missing config files are listed in errors`
Files: `src/cli/config-cmd.ts` (modify), `tests/cli/config-cmd.test.ts` (modify)

TDD:

1. `reject non-object servers section` → impl → refactor
2. `missing config files are listed in errors` → impl → refactor

Gotchas:

- Avoid overwriting user MCP content on errors.

---

## Done

- [ ] TDD cycles pass
- [ ] Exports match interface
- [ ] Test IDs implemented
- [ ] Status → PASS
