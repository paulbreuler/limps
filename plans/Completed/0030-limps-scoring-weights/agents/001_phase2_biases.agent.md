---
title: Scoring Biases
status: PASS
persona: coder
dependencies: ["000"]
blocks: ["003", "004"]
tags: [limps/agent, limps/status/pass, limps/persona/coder]
aliases: ["#001", "Biases Agent"]
created: 2026-01-27
updated: 2026-02-01
files:
  - path: src/config.ts
    action: modify
  - path: src/cli/next-task.ts
    action: modify
  - path: tests/cli/next-task.test.ts
    action: modify
---

# Agent 001: Scoring Biases

**Plan Location**: `plans/0030-limps-scoring-weights/0030-limps-scoring-weights-plan.md`

## Scope

Features: Phase 2 - Biases
Own: ScoringBiases interface, bias application logic
Depend on: Agent 000 (Core Weight System)
Block: Agents 003, 004

## Critical Context

Biases add/subtract from the weighted score. They allow prioritizing specific plans, personas, or statuses.

## Interfaces

### Export (from config.ts)

```typescript
export interface ScoringBiases {
  plans?: {
    [planId: string]: number;  // -50 to +50 bias
  };
  personas?: {
    coder?: number;
    reviewer?: number;
    pm?: number;
    customer?: number;
  };
  statuses?: {
    GAP?: number;
    WIP?: number;
    BLOCKED?: number;
  };
}

export interface ServerConfig {
  scoring?: {
    weights?: Partial<ScoringWeights>;
    biases?: Partial<ScoringBiases>;
  };
}

export const DEFAULT_SCORING_BIASES: ScoringBiases;
export function getScoringBiases(config: ServerConfig): ScoringBiases;
```

---

## Features

### #0: ScoringBiases Interface

TL;DR: Define the interface for configurable biases
Status: `PASS`

TDD:
1. `ScoringBiases interface exists` → add to config.ts → export
2. `DEFAULT_SCORING_BIASES = {}` → all biases default to 0
3. `getScoringBiases() merges with defaults` → test partial overrides

### #1: Plan Biases

TL;DR: Allow +/- score adjustment per plan
Status: `PASS`

TDD:
1. `plan bias applied to score` → match planFolder → add bias
2. `unknown plan = no bias` → no crash, just skip
3. `bias can be negative` → subtract from score

### #2: Persona Biases

TL;DR: Allow +/- score adjustment per persona
Status: `PASS`

TDD:
1. `persona bias applied to score` → match agent.frontmatter.persona → add bias
2. `unknown persona = no bias` → no crash
3. `config example: reviewer: -10` → reviewer tasks deprioritized

### #3: Status Biases

TL;DR: Allow +/- score adjustment per status
Status: `PASS`

TDD:
1. `status bias applied to score` → only GAP tasks scored, but still useful
2. `BLOCKED bias for visibility` → surface blocked tasks if desired

---

## Done

- [x] ScoringBiases interface added to config.ts
- [x] DEFAULT_SCORING_BIASES constant defined
- [x] getScoringBiases() helper function
- [x] Plan biases applied in scoreTask()
- [x] Persona biases applied in scoreTask()
- [x] Status biases applied in scoreTask()
- [x] Score floored at 0 (no negative scores)
- [x] Tests for plan biases
- [x] Tests for persona biases
- [x] Tests for combined biases
