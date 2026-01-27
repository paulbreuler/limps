---
title: Presets & CLI
status: GAP
persona: coder
dependencies: ["000", "001"]
blocks: ["004"]
tags: [limps/agent, limps/status/gap, limps/persona/coder]
aliases: ["#002", "Presets CLI Agent"]
created: 2026-01-27
updated: 2026-01-27
files:
  - path: src/config.ts
    action: modify
  - path: src/cli/next-task.ts
    action: modify
  - path: src/commands/config.tsx
    action: modify
  - path: tests/cli/next-task.test.ts
    action: modify
  - path: tests/commands/config.test.tsx
    action: modify
---

# Agent 002: Presets & CLI

**Plan Location**: `plans/0030-limps-scoring-weights/plan.md`

## Scope

Features: Phase 3 - Presets & CLI
Own: Preset definitions, CLI scoring commands
Depend on: Agents 000, 001
Block: Agent 004

## Critical Context

Presets are named configurations for common use cases. CLI commands let users inspect and modify scoring.

## Interfaces

### Presets (from config.ts)

```typescript
export type ScoringPreset = 'default' | 'quick-wins' | 'dependency-chain' | 'newest-first' | 'code-then-review';

export const SCORING_PRESETS: Record<ScoringPreset, { weights: ScoringWeights; biases: ScoringBiases }> = {
  'default': { weights: { dependency: 40, priority: 30, workload: 30 }, biases: {} },
  'quick-wins': { weights: { dependency: 20, priority: 20, workload: 60 }, biases: {} },
  'dependency-chain': { weights: { dependency: 60, priority: 20, workload: 20 }, biases: { statuses: { BLOCKED: 20 } } },
  'newest-first': { weights: { dependency: 30, priority: 30, workload: 20, recency: 20 }, biases: {} },
  'code-then-review': { weights: { dependency: 40, priority: 30, workload: 30 }, biases: { personas: { coder: 10, reviewer: -10 } } }
};

export interface ServerConfig {
  scoring?: {
    preset?: ScoringPreset;
    weights?: Partial<ScoringWeights>;
    biases?: Partial<ScoringBiases>;
  };
}
```

---

## Features

### #0: Preset Definitions

TL;DR: Define named presets for common configurations
Status: `GAP`

TDD:
1. `SCORING_PRESETS constant exists` → define all 5 presets
2. `preset applied when set` → override defaults with preset values
3. `custom weights override preset` → layered: defaults < preset < custom

### #1: CLI Scoring Config

TL;DR: Commands to view and modify scoring config
Status: `GAP`

Commands:
```bash
limps config scoring              # View current scoring config
limps config scoring --preset X   # Set a preset
limps config scoring --weight X=Y # Adjust individual weight
limps config scoring --bias X=Y   # Add bias
```

TDD:
1. `config scoring shows weights` → display current config
2. `--preset sets preset in config` → write to config.json
3. `--weight updates individual` → merge with existing

### #2: Score Task Command

TL;DR: Command to see how a specific task scores
Status: `GAP`

```bash
limps score-task 0027#001
```

TDD:
1. `shows full breakdown` → weights, biases, total
2. `handles invalid task` → error message

### #3: Score All Command

TL;DR: Compare scoring across all tasks in a plan
Status: `GAP`

```bash
limps score-all --plan 0027
```

TDD:
1. `lists all tasks with scores` → sorted by score desc
2. `shows which would be next` → mark the winner

---

## Done

- [ ] SCORING_PRESETS constant defined
- [ ] Preset selection in config.json
- [ ] Preset applied before custom weights/biases
- [ ] `limps config scoring` shows config
- [ ] `--preset` flag sets preset
- [ ] `--weight` flag adjusts weights
- [ ] `--bias` flag adds biases
- [ ] `limps score-task` command
- [ ] `limps score-all` command
- [ ] Tests for presets
- [ ] Tests for CLI commands
