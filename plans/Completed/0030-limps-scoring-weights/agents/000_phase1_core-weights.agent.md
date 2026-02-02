---
title: Core Weight System
status: PASS
persona: coder
dependencies: []
blocks: ["001", "002", "003", "004"]
tags: [limps/agent, limps/status/pass, limps/persona/coder]
aliases: ["#000", "Core Weights Agent"]
created: 2026-01-27
updated: 2026-01-27
files:
  - path: src/config.ts
    action: modify
  - path: src/cli/next-task.ts
    action: modify
  - path: tests/cli/next-task.test.ts
    action: modify
---

# Agent 000: Core Weight System

**Plan Location**: `plans/0030-limps-scoring-weights/0030-limps-scoring-weights-plan.md`

## Scope

Features: Phase 1 - Core Weight System
Own: ScoringWeights interface, weight configuration, scoring functions
Depend on: Nothing
Block: All other agents

## Critical Context

This is the foundation. All other phases build on this.

## Interfaces

### Export (from config.ts)

```typescript
export interface ScoringWeights {
  dependency: number;  // default: 40
  priority: number;    // default: 30
  workload: number;    // default: 30
}

export interface ServerConfig {
  // ... existing fields
  scoring?: {
    weights?: Partial<ScoringWeights>;
  };
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights;
export function getScoringWeights(config: ServerConfig): ScoringWeights;
```

### Updated (next-task.ts)

```typescript
function calculateDependencyScore(agent, allAgents, maxScore = 40);
function calculatePriorityScore(agent, maxScore = 30);
function calculateWorkloadScore(agent, maxScore = 30);
function scoreTask(agent, allAgents, weights?: ScoringWeights);
```

---

## Features

### #0: ScoringWeights Interface

TL;DR: Define the interface for configurable weights
Status: `PASS`

Implementation:
- Added `ScoringWeights` interface with dependency/priority/workload
- Extended `ServerConfig` with optional `scoring.weights`
- Created `DEFAULT_SCORING_WEIGHTS` constant (40/30/30)
- Created `getScoringWeights()` helper

### #1: Parameterized Scoring Functions

TL;DR: Update scoring functions to accept configurable max scores
Status: `PASS`

Implementation:
- `calculateDependencyScore()` accepts optional `maxScore` parameter
- `calculatePriorityScore()` accepts optional `maxScore` parameter
- `calculateWorkloadScore()` accepts optional `maxScore` parameter
- `scoreTask()` accepts optional `ScoringWeights` and passes to functions
- `getNextTaskData()` loads weights from config

### #2: Output Formatting

TL;DR: Display dynamic max scores in CLI output
Status: `PASS`

Implementation:
- `nextTask()` displays actual weights in score breakdown
- Total score shows sum of configured weights

---

## Done

- [x] ScoringWeights interface added to config.ts
- [x] DEFAULT_SCORING_WEIGHTS constant defined
- [x] getScoringWeights() helper function
- [x] calculateDependencyScore() accepts maxScore
- [x] calculatePriorityScore() accepts maxScore
- [x] calculateWorkloadScore() accepts maxScore
- [x] scoreTask() accepts weights parameter
- [x] getNextTaskData() loads weights from config
- [x] CLI output shows dynamic max scores
- [x] Tests for default weights
- [x] Tests for custom weights
- [x] Tests for partial overrides
