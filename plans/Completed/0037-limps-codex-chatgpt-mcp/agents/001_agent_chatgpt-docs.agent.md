# Agent 1: ChatGPT Instructions + Docs

**Plan Location**: `plans/0037-limps-codex-chatgpt-mcp/0037-limps-codex-chatgpt-mcp-plan.md`

## Scope

Features: #2, #3
Own: `src/commands/config/sync-mcp.tsx`, `src/commands/config/index.tsx`, `README.md`, `tests/cli/config-cmd.test.ts`
Depend on: Agent 0 for adapter exports
Block: none

## Interfaces

### Export

```typescript
// #2
export function generateChatGptInstructions(resolveConfigPathFn: () => string, projectFilter?: string[]): string;
```

### Receive

```typescript
// #1 (Agent 0) ✅ READY
// getAdapter(..., 'codex') + configAddCodex
```

## Features

### #2: ChatGPT MCP Setup Guidance

TL;DR: Provide manual instructions output for ChatGPT MCP connectors.
Status: `GAP`
Test IDs: `generateChatGptInstructions lists projects and required fields`, `sync-mcp routes chatgpt to instructions only`
Files: `src/cli/config-cmd.ts` (modify), `src/commands/config/sync-mcp.tsx` (modify)

TDD:

1. `generateChatGptInstructions lists projects and required fields` → impl → refactor
2. `sync-mcp routes chatgpt to instructions only` → impl → refactor

Gotchas:

- ChatGPT requires a remote MCP server; do not pretend to write local config.

---

### #3: Docs + CLI UX Updates

TL;DR: Update README + CLI help to mention Codex and ChatGPT.
Status: `GAP`
Test IDs: `config command usage mentions codex/chatgpt`
Files: `README.md` (modify), `src/commands/config/index.tsx` (modify)

TDD:

1. `config command usage mentions codex/chatgpt` → impl → refactor

---

## Done

- [ ] TDD cycles pass
- [ ] Exports match interface
- [ ] Test IDs implemented
- [ ] Status → PASS

<!-- limps:graph-links:start -->
## LIMPS Graph Links

Plan:
- [Plan](../0037-limps-codex-chatgpt-mcp-plan.md)

Depends on:
_No dependencies found_

Blocks:
_No blocks found_

<!-- limps:graph-links:end -->
