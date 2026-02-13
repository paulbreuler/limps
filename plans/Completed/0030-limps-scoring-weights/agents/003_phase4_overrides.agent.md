---
title: Granular Overrides
status: PASS
persona: coder
dependencies: ["000", "001"]
blocks: ["004"]
tags: [limps/agent, limps/status/pass, limps/persona/coder]
aliases: ["#003", "Overrides Agent"]
created: 2026-01-27
updated: 2026-02-01
files:
  - path: src/agent-parser.ts
    action: modify
  - path: src/cli/next-task.ts
    action: modify
  - path: tests/cli/next-task.test.ts
    action: modify
---






# Agent 003: Granular Overrides

**Plan Location**: `plans/0030-limps-scoring-weights/0030-limps-scoring-weights-plan.md`

## Scope

Features: Phase 4 - Granular Overrides
Own: Plan-level and agent-level scoring overrides
Depend on: Agents 000, 001
Block: Agent 004

## Critical Context

Allow scoring to be overridden at plan or agent level via frontmatter. More specific overrides win.

## Interfaces

### Plan Frontmatter

```yaml
---
title: Urgent Bugfix
scoring:
  bias: 30           # This plan gets +30 to all tasks
  weights:           # Override global weights for this plan
    dependency: 60
    workload: 20
    priority: 20
---
```

### Agent Frontmatter

```yaml
---
status: GAP
persona: coder
scoring:
  bias: 10           # This specific task gets +10
---
```

---

## Features

### #0: Plan Frontmatter Scoring

TL;DR: Parse scoring section from plan file frontmatter
Status: `PASS`

TDD:
1. `plan frontmatter parsed` → extract scoring.bias and scoring.weights
2. `plan weights override global` → merge with global config
3. `plan bias applied` → add to all tasks in plan

### #1: Agent Frontmatter Scoring

TL;DR: Parse scoring section from agent frontmatter
Status: `PASS`

TDD:
1. `agent frontmatter parsed` → extend AgentFrontmatter type
2. `agent bias applied` → add to individual task score
3. `agent bias stacks with plan` → plan bias + agent bias

### #2: Override Precedence

TL;DR: More specific overrides win
Status: `PASS`

Precedence (later wins):
1. Global config (config.json)
2. Preset (if set)
3. Plan frontmatter
4. Agent frontmatter

TDD:
1. `agent weight overrides plan` → verify agent wins
2. `plan weight overrides global` → verify plan wins
3. `missing override uses parent` → fallback chain works

---

## Done

- [x] Plan frontmatter scoring section parsed
- [x] Plan-level weights override global
- [x] Plan-level bias applied to all tasks
- [x] Agent frontmatter scoring section parsed
- [x] Agent-level bias applied
- [x] Override precedence documented and tested
- [x] AgentFrontmatter type extended
- [x] Tests for plan overrides
- [x] Tests for agent overrides
- [x] Tests for precedence

<!-- limps:graph-links:start -->
## LIMPS Graph Links

Plan:
- [Plan](../0030-limps-scoring-weights-plan.md)

Depends on:
- [Agent 000](./000_phase1_core-weights.agent.md)
- [Agent 001](./001_phase2_biases.agent.md)

Blocks:
- [Agent 004](./004_phase5_mcp.agent.md)

<!-- limps:graph-links:end -->
