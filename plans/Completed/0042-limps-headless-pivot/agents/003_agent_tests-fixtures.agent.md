# Agent 3: Tests + Fixtures

**Plan Location**: `plans/0042-limps-headless-pivot/0042-limps-headless-pivot-plan.md`

## Scope

Features: #6
Own: `packages/limps-headless/tests/*`, `packages/limps-headless/tests/fixtures/*`
Depend on: Agents 000-002 for finalized interfaces and report shape
Block: None

## Interfaces

### Receive

```typescript
// #1/#2/#3/#4 (Agents 001/002) ✅ READY
export interface AuditResult {
  inventory: ComponentInventory[];
  summary: AuditSummary;
  issues: Issue[];
}
```

## Features

### #6: Tests + Fixtures

TL;DR: Add fixtures and tests for discovery, migration, report, policy.
Status: `PASS`
Test IDs: `fixture-radix`, `fixture-base`, `fixture-mixed`, `report-snapshot`
Files: `packages/limps-headless/tests/*` (create)

TDD:
1. `discovery fixtures` → add fixtures → reuse fixture loader
2. `provider rules` → add provider harness → mock context
3. `report snapshot` → add JSON snapshot → stabilize ordering

Gotchas:
- fixtures must include both import + JSX evidence for detection

---

## Done

- [x] Fixture coverage for all backends
- [x] Report snapshot stable
- [x] Status → PASS

<!-- limps:graph-links:start -->
## LIMPS Graph Links

Plan:
- [Plan](../0042-limps-headless-pivot-plan.md)

Depends on:
_No dependencies found_

Blocks:
_No blocks found_

<!-- limps:graph-links:end -->
