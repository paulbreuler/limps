---
title: Get Next Task Dependency Resolution Bug
status: GAP
workType: bug
tags: [limps/plan, limps/worktype/bug, limps/priority/high]
created: 2026-02-01
updated: 2026-02-01
---

# Bug: get_next_task Dependency Resolution

## Summary

`get_next_task` incorrectly reports agents with `depends_on` frontmatter as having "No dependencies (unblocked)" and awards full dependency score (40 points) even when the dependency agents have `status: GAP`.

## Severity

**High** — This defeats the purpose of dependency tracking in LIMPS. Agents are being suggested out of order, potentially causing work to be done before prerequisites are complete.

## Reproduction

### Setup

Plan `0013-Feature Flags System` in runi-planning has:

**Agent 000** (Types Foundation):
```yaml
---
title: Types Foundation
agent: "000"
status: GAP
persona: coder
depends_on: []
files: [...]
---
```

**Agent 001** (Store & Hooks):
```yaml
---
title: Store & Hooks
agent: "001"
status: GAP
persona: coder
depends_on:
  - "000"
files: [...]
---
```

### Expected Behavior

When calling `get_next_task` for plan 13:

1. Agent 001 should be recognized as having a dependency on Agent 000
2. Since Agent 000 has `status: GAP` (not `PASS`), Agent 001's dependency is **unsatisfied**
3. Agent 001 should receive `dependencyScore: 0` (or similar penalty)
4. Agent 000 should be returned as the next task (it has no dependencies)

### Actual Behavior

```json
{
  "taskId": "0013-Feature Flags System#001",
  "title": "Store & Hooks",
  "totalScore": 82,
  "dependencyScore": 40,
  "priorityScore": 27,
  "workloadScore": 15,
  "reasons": [
    "No dependencies (unblocked)",  // WRONG - has depends_on: ["000"]
    "Agent #1 priority: 27/30",
    "3 files to modify: 15/30"
  ],
  "otherAvailableTasks": 3
}
```

Agent 001 is being suggested even though Agent 000 (its dependency) is not complete.

## Root Cause Investigation

Likely causes to investigate:

1. **Frontmatter parsing** — Is `depends_on: ["000"]` being parsed correctly?
2. **Dependency lookup** — Is the code looking up agent "000" status correctly?
3. **Status comparison** — Is the code checking if dependency status === "PASS"?
4. **Score calculation** — Is the dependency score being calculated before/after dependency check?

## Fix Requirements

1. Parse `depends_on` from agent frontmatter correctly
2. For each dependency in `depends_on`:
   - Find the corresponding agent file in the same plan
   - Check if that agent's `status` is `PASS`
3. If ANY dependency has status !== `PASS`, the agent is **blocked**:
   - Set `dependencyScore: 0`
   - Add reason: `"Blocked by: 000 (GAP)"`
4. Only agents with ALL dependencies satisfied (status: PASS) should get full dependency score

## Acceptance Criteria

- [ ] Agent with `depends_on: ["000"]` is not suggested when Agent 000 has `status: GAP`
- [ ] `get_next_task` response includes accurate dependency information
- [ ] Reason string shows "Blocked by: XXX" when dependencies unsatisfied
- [ ] Agent with no dependencies OR all dependencies PASS gets full dependency score
- [ ] Existing tests pass (no regression)

## Test Cases

```gherkin
Scenario: Agent with unsatisfied dependency is blocked
  Given Agent 000 has status GAP
  And Agent 001 has depends_on: ["000"]
  When get_next_task is called
  Then Agent 001 should have dependencyScore 0
  And Agent 001 reasons should include "Blocked by: 000 (GAP)"
  And Agent 000 should be returned as next task

Scenario: Agent with satisfied dependency is unblocked
  Given Agent 000 has status PASS
  And Agent 001 has depends_on: ["000"]
  When get_next_task is called
  Then Agent 001 should have dependencyScore 40
  And Agent 001 reasons should include "All dependencies satisfied"

Scenario: Agent with no dependencies is unblocked
  Given Agent 000 has depends_on: []
  When get_next_task is called
  Then Agent 000 should have dependencyScore 40
  And Agent 000 reasons should include "No dependencies"

Scenario: Agent with partial dependencies is blocked
  Given Agent 000 has status PASS
  And Agent 001 has status GAP
  And Agent 002 has depends_on: ["000", "001"]
  When get_next_task is called
  Then Agent 002 should have dependencyScore 0
  And Agent 002 reasons should include "Blocked by: 001 (GAP)"
```

## Files to Investigate

- Task scoring logic (likely in `tools/` or `lib/`)
- Agent frontmatter parser
- `get_next_task` tool implementation

## Related

- Plan 0030: Scoring Weights (dependency weight is configurable, but resolution itself is broken)
