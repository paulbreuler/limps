---
title: Conflict Detection
status: GAP
persona: coder
depends_on: [001, 004]
files:
  - src/context/conflicts.ts
  - src/cli/commands/context/conflicts.ts
  - src/cli/commands/context/validate.ts
tags: [context, conflicts, validation]
---

# Agent 006: Conflict Detection

## Objective

Detect and surface conflicts in inherited context.

## Tasks

1. **Conflict detector** (`src/context/conflicts.ts`)
   - Detect direct contradictions (same key, incompatible values)
   - Detect stale overrides (child overrides stale parent)
   - Detect orphan references (refs to superseded/deleted docs)
   - Detect circular supersession

2. **Conflict types**
   ```typescript
   type ConflictType = 
     | 'direct_contradiction'  // Same key, different values
     | 'stale_override'        // Overriding stale parent
     | 'orphan_reference'      // Refs superseded doc
     | 'circular_supersession' // A → B → A
   ```

3. **Conflicts CLI**
   - `limps context conflicts` — Show all conflicts
   - `limps context conflicts <plan>` — Scope to plan
   - `limps context conflicts --severity critical` — Filter

4. **Validation CLI**
   - `limps context validate` — Exit non-zero if conflicts
   - Useful for CI/CD pipelines
   - `--ignore-warnings` to only fail on critical

## Conflict Output Format

```
$ limps context conflicts

⚠️ CONFLICT [critical]: Direct contradiction
   workspace.md: database = PostgreSQL
   plan-0042.md: database = SQLite (override)
   Resolution: Using plan value (higher priority)

⚠️ CONFLICT [warning]: Stale override
   plan-0042.md overrides architecture.md
   architecture.md is 25 days old (threshold: 14)
   Recommendation: Review parent document

✗ CONFLICT [critical]: Orphan reference
   plan-0042.md references ADR-0003
   ADR-0003 was superseded by ADR-0010
   Recommendation: Update reference to ADR-0010
```

## Acceptance Criteria

- [ ] All conflict types detected
- [ ] `limps context validate` fails CI on conflicts
- [ ] Conflicts include resolution/recommendation
- [ ] Severity filtering works
- [ ] Clear output format with context
