# Agent 2: Skills Packaging

**Plan Location**: `plans/0044-mcp-server-chart-learnings/0044-mcp-server-chart-learnings-plan.md`

## Scope

Features: #3
Own: `skills/limps-planning/*`, README skills section
Depend on: Agent 000 for README placement
Block: none

## Interfaces

### Export

- Published skill package structure with README and usage
- Install command documented in limps README

### Receive

- None

## Features

### #3: Publish limps planning skill

TL;DR: Provide a standalone skill package with prompts and tool-selection guidance.
Status: `PASS`
Test IDs: `skills-structure-valid`, `readme-skills-section`
Files: `skills/limps-planning/*` (create), `README.md` (edit)

TDD:

1. `skill repo structure is valid` → create package → validate metadata
2. `skill docs referenced in README` → add docs → verify link

Gotchas:

- Ensure skill package is consumable via `npx skills add ...`
- Keep tool names aligned with limps MCP tool IDs

---

## Done

- [x] Skill package created
- [x] README contains install + usage snippet
- [x] Status → PASS
