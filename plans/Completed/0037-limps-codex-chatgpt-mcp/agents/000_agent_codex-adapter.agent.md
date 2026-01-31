# Agent 0: Codex Adapter + Tests

**Plan Location**: `plans/0037-limps-codex-chatgpt-mcp/0037-limps-codex-chatgpt-mcp-plan.md`

## Scope

Features: #1
Own: `src/cli/mcp-client-adapter.ts`, `src/cli/config-cmd.ts`, `tests/cli/config-cmd.test.ts`
Depend on: none
Block: Agent 1 waiting on updated adapter API

## Interfaces

### Export

```typescript
// #1
export class CodexAdapter implements McpClientAdapter;
export function configAddCodex(resolveConfigPathFn: () => string, projectFilter?: string[]): string;
```

### Receive

```typescript
// None
```

## Features

### #1: Codex MCP Client Adapter

TL;DR: Add Codex TOML adapter + config sync tests.
Status: `GAP`
Test IDs: `configAddCodex writes mcp_servers`, `configAddCodex preserves existing TOML keys`
Files: `src/cli/mcp-client-adapter.ts` (modify), `src/cli/config-cmd.ts` (modify), `tests/cli/config-cmd.test.ts` (modify)

TDD:

1. `configAddCodex writes mcp_servers to config.toml` → impl → refactor
2. `configAddCodex preserves existing TOML keys` → impl → refactor

Gotchas:

- TOML parsing/writing must preserve unrelated settings.

---

## Done

- [ ] TDD cycles pass
- [ ] Exports match interface
- [ ] Test IDs implemented
- [ ] Status → PASS
