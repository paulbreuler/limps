---
title: Staleness Detection
status: GAP
persona: coder
depends_on: [001]
files:
  - src/context/staleness.ts
  - src/cli/commands/context/health.ts
tags: [context, staleness, health]
---

# Agent 004: Staleness Detection

## Objective

Detect stale context files and surface freshness warnings.

## Tasks

1. **Staleness calculator** (`src/context/staleness.ts`)
   - `calculateStaleness(doc)`: Return score 0-1
   - Compare `updated` to expected refresh interval
   - Default thresholds: warning=14d, critical=30d, archive=90d
   - Per-document `refresh_interval` frontmatter override

2. **Staleness scoring**
   ```typescript
   interface StalenessScore {
     score: number;           // 0-1 (higher = more stale)
     status: 'fresh' | 'warning' | 'critical';
     daysOld: number;
     recommendedAction: 'none' | 'review' | 'archive';
   }
   ```

3. **Health CLI** (`src/cli/commands/context/health.ts`)
   - `limps context health` — Check all context files
   - `limps context health --stale` — Only show stale
   - `limps context health <plan>` — Scope to plan
   - Output includes staleness status for each file

4. **Freshness in context resolution**
   - Include staleness info when resolving context
   - Warn if inherited context is stale
   - `--no-warnings` to suppress

## Acceptance Criteria

- [ ] `limps context health` shows staleness for all files
- [ ] Warning at 14 days, critical at 30 days (configurable)
- [ ] Context resolution warns about stale inheritance
- [ ] Per-file `refresh_interval` overrides defaults
- [ ] Archive recommendation at 90 days
