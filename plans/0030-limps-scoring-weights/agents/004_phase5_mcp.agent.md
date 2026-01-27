---
title: MCP Integration
status: GAP
persona: coder
dependencies: ["000", "001", "002", "003"]
blocks: []
tags: [limps/agent, limps/status/gap, limps/persona/coder]
aliases: ["#004", "MCP Agent"]
created: 2026-01-27
updated: 2026-01-27
files:
  - path: src/tools/index.ts
    action: modify
  - path: src/tools/get-next-task.ts
    action: modify
  - path: tests/get-next-task.test.ts
    action: modify
---

# Agent 004: MCP Integration

**Plan Location**: `plans/0030-limps-scoring-weights/0030-limps-scoring-weights-plan.md`

## Scope

Features: Phase 5 - MCP Integration
Own: MCP tool updates, configure_scoring tool
Depend on: All previous agents
Block: Nothing (final phase)

## Critical Context

Update the MCP `get_next_task` tool response and add a new `configure_scoring` tool.

## Interfaces

### Updated get_next_task Response

```typescript
{
  taskId: "0027-limps-roadmap#002",
  title: "Implement scoring weights",
  totalScore: 95,
  breakdown: {
    dependency: { raw: 1.0, weighted: 40, weight: 40 },
    priority: { raw: 0.8, weighted: 24, weight: 30 },
    workload: { raw: 0.7, weighted: 21, weight: 30 },
    biases: {
      plan: 5,
      persona: 0,
      agent: 5
    }
  },
  configUsed: "quick-wins",  // or "custom" or "default"
  otherAvailableTasks: 5
}
```

### New Tool: configure_scoring

```typescript
tool: "configure_scoring"
params: {
  weights?: Partial<ScoringWeights>;
  biases?: Partial<ScoringBiases>;
  preset?: ScoringPreset;
  scope?: "global" | "plan" | "agent";
  targetId?: string;  // Plan or agent ID if scoped
}
```

---

## Features

### #0: Enhanced get_next_task Response

TL;DR: Return detailed score breakdown in MCP response
Status: `GAP`

TDD:
1. `response includes breakdown` → raw, weighted, weight for each factor
2. `response includes biases` → plan, persona, agent biases shown
3. `response includes configUsed` → identify which config/preset active
4. `backward compatible` → existing fields unchanged

### #1: configure_scoring Tool

TL;DR: MCP tool to modify scoring config
Status: `GAP`

TDD:
1. `set preset via tool` → update config.json
2. `adjust weight via tool` → merge with existing
3. `scope to plan/agent` → write to frontmatter
4. `validation errors` → invalid preset, out of range values

### #2: Validation & Error Handling

TL;DR: Robust validation for all scoring inputs
Status: `GAP`

TDD:
1. `weights must be non-negative` → error if < 0
2. `biases in range -50 to +50` → warn if extreme
3. `unknown preset returns error` → list valid presets
4. `scope requires targetId` → error if missing

---

## Done

- [ ] get_next_task returns score breakdown
- [ ] Breakdown includes raw, weighted, weight
- [ ] Breakdown includes all bias sources
- [ ] configUsed field shows active preset/custom
- [ ] configure_scoring tool registered
- [ ] Tool updates global config
- [ ] Tool supports plan scope
- [ ] Tool supports agent scope
- [ ] Validation for weights
- [ ] Validation for biases
- [ ] Validation for presets
- [ ] Tests for enhanced response
- [ ] Tests for configure_scoring
- [ ] Tests for validation
