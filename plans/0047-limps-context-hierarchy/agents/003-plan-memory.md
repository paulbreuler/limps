---
title: Plan Memory System
status: GAP
persona: coder
depends_on: [002]
files:
  - src/memory/plan-memory.ts
  - src/cli/commands/memory/plan.ts
tags: [memory, plan, shared]
---

# Agent 003: Plan Memory System

## Objective

Implement plan-level shared memory for cross-agent learnings.

## Tasks

1. **Plan memory manager** (`src/memory/plan-memory.ts`)
   - `getPlanMemory(planId)`: Load plan.memory.md
   - `addSharedDiscovery(planId, text, contributorAgents)`
   - `addPlanDecision(planId, choice, affectedAgents, rationale)`
   - `addLesson(planId, text)`
   - `addOpenQuestion(planId, text)`

2. **Promotion from agent to plan**
   - `promoteToShared(planId, agentId, type, index)`
   - Copy finding/decision to plan memory
   - Track which agent contributed

3. **Plan memory CLI**
   - `limps memory plan show <plan>` — Display plan memory
   - `limps memory plan add <plan> discovery <text>`
   - `limps memory plan add <plan> decision <choice> --affects <agents>`
   - `limps memory promote <plan> <agent> finding-3` — Promote from agent

## Plan Memory File

```
plans/0042-knowledge-graph/
├── 0042-plan.md
├── plan.memory.md          # Shared memory
└── agents/
    ├── 001.md
    └── 001.memory.md       # Agent memory
```

## Acceptance Criteria

- [ ] Plan memory stored in `plan.memory.md`
- [ ] Shared discoveries track contributing agents
- [ ] `limps memory promote` moves agent findings to plan
- [ ] Plan memory included in context resolution for all agents
- [ ] Open questions visible to all agents in plan
