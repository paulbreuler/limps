# Agent 3: Close Workflow Alignment

**Plan Location**: `plans/0039-llm-usage-improvements/0039-llm-usage-improvements-plan.md`

## Scope

Features: #4
Own: `.claude/commands/close-feature-agent.md`, `.claude/commands/run-agent.md`
Depend on: none
Block: none

## Interfaces

### Export

```typescript
// #4
(none)
```

### Receive

```typescript
// None
```

## Features

### #4: Agent Close Workflow Alignment

TL;DR: Align close-feature-agent and run-agent workflows for agent-only plans.
Status: `PASS`
Test IDs: `close-feature-agent skips update_task_status for agent-only plans`, `close-feature-agent emits note for agent-only status`, `run-agent validates agent path`, `run-agent prints checklist`
Files: `.claude/commands/close-feature-agent.md` (modify), `.claude/commands/run-agent.md` (modify)

TDD:

1. `close-feature-agent skips update_task_status for agent-only plans` → impl → refactor
2. `close-feature-agent emits note for agent-only status` → impl → refactor
3. `run-agent validates agent path` → impl → refactor
4. `run-agent prints checklist` → impl → refactor

Gotchas:

- Preserve existing behavior for plans with real feature IDs.

---

## Done

- [ ] TDD cycles pass
- [ ] Exports match interface
- [ ] Test IDs implemented
- [ ] Status → PASS
