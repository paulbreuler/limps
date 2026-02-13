# Agent 1: Tool Filtering (Allow/Deny)

**Plan Location**: `plans/0044-mcp-server-chart-learnings/0044-mcp-server-chart-learnings-plan.md`

## Scope

Features: #2
Own: `packages/limps/src/tools/index.ts`, `packages/limps/src/config.ts`, `packages/limps/src/types.ts`, tests
Depend on: none
Block: Agent 000 for env var names (sync doc wording)

## Interfaces

### Export
```ts
export interface ToolFilteringConfig {
  allowlist?: string[];
  denylist?: string[];
}
```

```ts
export function filterToolDefinitions(
  tools: ToolDefinition[],
  config: ToolFilteringConfig | undefined,
  env: NodeJS.ProcessEnv
): ToolDefinition[];
```

### Receive
- None

## Features

### #2: Tool Filtering

TL;DR: Allow/deny list controls which MCP tools are registered.
Status: `PASS`
Test IDs: `tool-filter-allowlist`, `tool-filter-denylist`, `tool-filter-unknown`
Files: `packages/limps/src/tools/index.ts` (edit), `packages/limps/src/config.ts` (edit), `packages/limps/src/types.ts` (edit), tests

TDD:
1. `filters tools via allowlist` → implement filter → refactor names
2. `filters tools via denylist` → implement filter → refactor
3. `unknown tools warned` → log + test

Gotchas:
- Tool names must match registry keys exactly
- Avoid filtering required internal tools (if any)

---

## Done
- [x] Allowlist and denylist supported
- [x] Unknown tools warned and ignored
- [x] Config + env var precedence documented
- [x] Tests added
- [x] Status → PASS

<!-- limps:graph-links:start -->
## LIMPS Graph Links

Plan:
- [Plan](../0044-mcp-server-chart-learnings-plan.md)

Depends on:
_No dependencies found_

Blocks:
_No blocks found_

<!-- limps:graph-links:end -->
