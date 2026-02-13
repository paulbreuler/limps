# Agent 0: Docs & README Parity

**Plan Location**: `plans/0044-mcp-server-chart-learnings/0044-mcp-server-chart-learnings-plan.md`

## Scope

Features: #1, #4
Own: `README.md`, `packages/limps-headless/README.md`
Depend on: none
Block: Agent 001/002 can proceed in parallel

## Interfaces

### Export
- Updated README sections: TOC, Features, CLI Options, Environment Variables, Skills, Transport
- Windows setup snippets

### Receive
- Tool filtering env var names from Agent 001
- Skill install command/repo from Agent 002

## Features

### #1: README & Docs Parity

TL;DR: Add TOC, features list, CLI options, env var table, Windows config snippets, and skills section.
Status: `PASS`
Test IDs: `readme-toc`, `readme-env-table`, `readme-windows-setup`
Files: `README.md` (edit), `packages/limps-headless/README.md` (edit if needed)

TDD:
1. `README includes TOC` → add TOC → verify anchors
2. `README includes env var table` → add table → verify values
3. `README includes windows setup` → add snippet → verify parity

Gotchas:
- Keep section names stable to avoid breaking existing links

---

### #4: Transport & Deployment Docs

TL;DR: Document current stdio transport and future SSE/HTTP roadmap.
Status: `PASS`
Test IDs: `readme-transport-section`
Files: `README.md` (edit)

TDD:
1. `transport section exists` → add section → verify clarity
2. `roadmap disclaimers included` → add notes → verify no promises

Gotchas:
- Avoid implying SSE/HTTP is already supported

---

## Done
- [x] README sections updated and consistent
- [x] Windows config snippet validated
- [x] Transport roadmap section added
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
