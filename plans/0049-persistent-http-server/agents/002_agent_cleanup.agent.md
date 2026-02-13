---
title: 'Remove serve, bump v3, update deps'
status: GAP
persona: coder
depends_on:
  - ./000_agent_foundation.agent.md
  - ./001_agent_http-server.agent.md
files:
  - packages/limps/src/commands/serve.tsx
  - packages/limps/src/cli.tsx
  - packages/limps/package.json
tags:
  - cleanup
  - breaking-change
  - v3
---






# Agent 2: Cleanup — Remove serve, bump v3

**Plan Location**: `plans/0049-persistent-http-server/0049-persistent-http-server-plan.md`

## Scope

Features: #6
Own: `src/commands/serve.tsx` (delete), `src/cli.tsx`, `package.json`
Depend on: Agent 0 + Agent 1 (start/stop must work before removing serve)
Block: Nothing

## Interfaces

### Receive (from Agent 0, Agent 1) ✅ READY when both are PASS

```typescript
// Agent 1 provides working start/stop commands
// src/commands/start.tsx — replaces serve
// src/commands/stop.tsx — new
```

## Features

### #6: Remove `limps serve` and update CLI

TL;DR: Delete serve command, remove CLI bypass hack, bump to v3, add express dep.
Status: `GAP`
Files: `src/commands/serve.tsx` (delete), `src/cli.tsx` (modify), `package.json` (modify)

Steps:
1. **Delete** `src/commands/serve.tsx`
2. **Modify** `src/cli.tsx` — remove the serve bypass block (lines ~8-22 that detect `serve` in `process.argv` and call `startMcpServer()` directly bypassing Pastel). The `start` command doesn't need this hack because it uses HTTP transport, not stdio.
3. **Modify** `packages/limps/package.json`:
   - `"version": "3.0.0"`
   - Add `"express": "^5.0.1"` to `dependencies`
   - Add `"@types/express": "^5"` to `devDependencies`
4. **Update** any references to `serve` in help text, descriptions, or other commands (e.g., `config` command mentions serve)
5. **Check** `src/index.ts` — if it calls `startMcpServer()` for backward compat, update or remove

TDD:
1. `serve is not a valid command` → run `limps serve` → assert error or helpful message pointing to `limps start`
2. `start appears in help output` → run `limps --help` → assert `start` and `stop` listed
3. `build succeeds without serve` → `npm run build` → assert clean compilation

Gotchas:
- `src/index.ts` is a backward-compat entry for `"bin"` — may need updating to launch HTTP server instead of stdio
- Check `src/cli/config-cmd.ts` for serve references in help text
- Removing serve may break existing MCP client configs — this is intentional (v3 breaking change)

---

## Done

- [ ] `serve.tsx` deleted
- [ ] `cli.tsx` serve bypass removed
- [ ] `package.json` version 3.0.0
- [ ] `express` in direct dependencies
- [ ] No references to `limps serve` remain in codebase
- [ ] `npm run build` clean
- [ ] `npm test` passes
- [ ] Status → PASS

<!-- limps:graph-links:start -->
## LIMPS Graph Links

Plan:
- [Plan](../0049-persistent-http-server-plan.md)

Depends on:
- [Agent 000](./000_agent_foundation.agent.md)
- [Agent 001](./001_agent_http-server.agent.md)

Blocks:
_No blocks found_

<!-- limps:graph-links:end -->
