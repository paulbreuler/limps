# limps Scoring Weights & Biases

## Overview

Make the task scoring algorithm configurable. Let users define weights for each scoring component and add biases for specific plans, personas, or tags.

## Current State

The `get_next_task` algorithm uses hardcoded weights:

```typescript
// Current hardcoded scoring
const WEIGHTS = {
  dependency: 40,  // All deps satisfied = 40, else 0
  priority: 30,    // Based on agent number (lower = higher)
  workload: 30     // Based on file count (fewer = higher)
};
// Total: 100 points max
```

**Problems:**
- One-size-fits-all doesn't fit all
- Can't prioritize "quick wins" (low workload) over "dependency chains"
- Can't bias toward specific personas (e.g., always do reviewer tasks last)
- Can't mark plans as urgent/important

---

## Proposed Solution

### Configurable Weights

```typescript
interface ScoringWeights {
  // Core weights (must sum to 100)
  dependency: number;    // 0-100, default: 40
  priority: number;      // 0-100, default: 30  
  workload: number;      // 0-100, default: 30
  
  // Optional additional factors
  staleness?: number;    // Bonus for untouched tasks (0-20)
  recency?: number;      // Bonus for recently updated (0-20)
}
```

### Biases

```typescript
interface ScoringBiases {
  // Plan-level biases
  plans?: {
    [planId: string]: number;  // -50 to +50 bias
  };
  
  // Persona biases
  personas?: {
    coder?: number;      // -50 to +50
    reviewer?: number;
    pm?: number;
    customer?: number;
  };
  
  // Tag biases (if we add tags to agents)
  tags?: {
    [tag: string]: number;  // -50 to +50
  };
  
  // Status biases (e.g., prefer BLOCKED tasks to unblock others)
  statuses?: {
    GAP?: number;
    WIP?: number;
    BLOCKED?: number;
  };
}
```

### Final Score Calculation

```typescript
function calculateScore(task: Task, weights: ScoringWeights, biases: ScoringBiases): number {
  // Base scores (normalized to weight)
  let score = 0;
  score += task.depsResolved ? weights.dependency : 0;
  score += (1 - task.agentNumber / maxAgent) * weights.priority;
  score += (1 - task.fileCount / maxFiles) * weights.workload;
  
  // Optional factors
  if (weights.staleness) {
    const daysSinceUpdate = daysSince(task.updatedAt);
    score += Math.min(daysSinceUpdate, 30) / 30 * weights.staleness;
  }
  
  // Apply biases
  score += biases.plans?.[task.planId] ?? 0;
  score += biases.personas?.[task.persona] ?? 0;
  score += biases.statuses?.[task.status] ?? 0;
  
  // Tag biases
  for (const tag of task.tags ?? []) {
    score += biases.tags?.[tag] ?? 0;
  }
  
  return score;
}
```

---

## Configuration

### Global Config (config.json)

```json
{
  "scoring": {
    "weights": {
      "dependency": 40,
      "priority": 30,
      "workload": 30,
      "staleness": 10
    },
    "biases": {
      "personas": {
        "reviewer": -10,
        "coder": 5
      },
      "plans": {
        "0027-limps-roadmap": 20
      }
    }
  }
}
```

### Plan-Level Override (plan.md frontmatter)

```yaml
---
title: Urgent Bugfix
scoring:
  bias: 30           # This plan gets +30 to all tasks
  weights:           # Override global weights for this plan
    dependency: 60   # Deps matter more here
    workload: 20
    priority: 20
---
```

### Agent-Level Override (agent frontmatter)

```yaml
---
status: GAP
persona: coder
scoring:
  bias: 10           # This specific task gets +10
---
```

---

## Presets

Common configurations as named presets:

```json
{
  "scoring": {
    "preset": "quick-wins"  // Use a preset instead of custom
  }
}
```

| Preset | Description | Weights | Biases |
|--------|-------------|---------|--------|
| `default` | Balanced | 40/30/30 | none |
| `quick-wins` | Low workload first | 20/20/60 | none |
| `dependency-chain` | Clear blockers | 60/20/20 | BLOCKED: +20 |
| `newest-first` | Recent tasks | 30/30/20 + recency:20 | none |
| `code-then-review` | Coders before reviewers | 40/30/30 | coder: +10, reviewer: -10 |

---

## CLI Support

```bash
# View current scoring config
limps config scoring

# Set a preset
limps config scoring --preset quick-wins

# Adjust individual weight
limps config scoring --weight dependency=50

# Add plan bias
limps config scoring --bias plan:0027=20

# See how a task would score
limps score-task 0027-limps-roadmap#001

# Compare scoring across all tasks
limps score-all --plan 0027
```

---

## MCP Tool Updates

### Updated `get_next_task` response

```typescript
{
  taskId: "0027-limps-roadmap#002",
  title: "Implement scoring weights",
  totalScore: 95,
  breakdown: {
    dependency: { raw: 1.0, weighted: 40, weight: 40 },
    priority: { raw: 0.8, weighted: 24, weight: 30 },
    workload: { raw: 0.7, weighted: 21, weight: 30 },
    staleness: { raw: 0.5, weighted: 5, weight: 10 },
    biases: {
      plan: 5,
      persona: 0,
      tags: 0
    }
  },
  configUsed: "quick-wins",  // or "custom"
  otherAvailableTasks: 5
}
```

### New tool: `configure_scoring`

```typescript
tool: "configure_scoring"
params: {
  weights?: ScoringWeights;
  biases?: ScoringBiases;
  preset?: string;
  scope?: "global" | "plan" | "agent";
  targetId?: string;  // Plan or agent ID if scoped
}
```

---

## Implementation Plan

### Phase 1: Core Weight System
- [ ] Add `ScoringWeights` interface
- [ ] Update `calculateScore` to use weights
- [ ] Add weights to config schema
- [ ] Default weights match current behavior

### Phase 2: Biases
- [ ] Add `ScoringBiases` interface
- [ ] Plan-level biases
- [ ] Persona biases
- [ ] Status biases

### Phase 3: Presets & CLI
- [ ] Define preset configurations
- [ ] CLI commands for scoring config
- [ ] `score-task` and `score-all` commands

### Phase 4: Granular Overrides
- [ ] Plan frontmatter scoring section
- [ ] Agent frontmatter scoring section
- [ ] Inheritance/merge logic

### Phase 5: MCP Integration
- [ ] Update `get_next_task` response
- [ ] Add `configure_scoring` tool
- [ ] Validation and error handling

---

## Migration

Existing users get current behavior by default:
- Weights: 40/30/30
- No biases
- No presets

No breaking changes - all new fields optional.

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Weights don't sum to 100 | Normalize automatically, warn |
| Bias pushes score negative | Floor at 0 |
| Bias pushes score > 100 | Allow (biases are additive) |
| Conflicting plan + agent config | Agent wins (more specific) |
| Invalid preset name | Error, list valid presets |

---

## Success Criteria

- [ ] Can prioritize "quick wins" with preset
- [ ] Can mark a plan as urgent with bias
- [ ] Can deprioritize reviewer tasks
- [ ] Score breakdown shows all factors
- [ ] Zero behavioral change for existing users
- [ ] CLI can inspect/modify scoring

---

## Status

Status: Planning
Work Type: feature
Created: 2026-01-26
