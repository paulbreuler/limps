---
title: Agent Memory System
status: GAP
persona: coder
depends_on: [001]
files:
  - src/memory/agent-memory.ts
  - src/memory/types.ts
  - src/cli/commands/memory/index.ts
tags: [memory, agent, persistence]
---

# Agent 002: Agent Memory System

## Objective

Implement persistent memory for agents that survives across sessions.

## Tasks

1. **Memory types** (`src/memory/types.ts`)
   - `Finding`: Discoveries during work
   - `Decision`: Choices with rationale
   - `Blocker`: Open or resolved blockers
   - `SessionLog`: Brief session notes

2. **Memory manager** (`src/memory/agent-memory.ts`)
   - `getMemory(planId, agentId)`: Load memory file
   - `addFinding(planId, agentId, text)`: Add finding
   - `addDecision(planId, agentId, choice, rationale)`: Add decision
   - `addBlocker(planId, agentId, issue, status)`: Add blocker
   - `logSession(planId, agentId, notes)`: Add session entry
   - Auto-create memory file if missing

3. **Memory CLI** (`src/cli/commands/memory/`)
   - `limps memory show <plan> <agent>` — Display memory
   - `limps memory add <plan> <agent> finding <text>`
   - `limps memory add <plan> <agent> decision <choice> --rationale <why>`
   - `limps memory add <plan> <agent> blocker <issue> --status open|resolved`
   - `limps memory session <plan> <agent> <notes>`
   - `limps memory clear <plan> <agent>` — Reset with confirmation

## Memory File Format

```yaml
---
agent: 001-entity-resolution
plan: 0042-knowledge-graph
created: 2026-02-01
updated: 2026-02-02
sessions: 3
---

# Agent Memory: Entity Resolution

## Findings
- Finding 1...
- Finding 2...

## Decisions
| Decision | Choice | Rationale | Date |
|----------|--------|-----------|------|

## Blockers
- [ ] Open blocker
- [x] ~~Resolved blocker~~

## Session Log
### Session N — Date
Notes...
```

## Acceptance Criteria

- [ ] Memory persists in `{agent}.memory.md` file
- [ ] `limps memory show` displays formatted memory
- [ ] `limps memory add` appends to correct section
- [ ] Session count increments automatically
- [ ] Memory files are human-readable markdown
