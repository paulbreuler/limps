# Agent 2: Migration + Report

**Plan Location**: `plans/0042-0042-limps-headless-pivot/0042-0042-limps-headless-pivot-plan.md`

## Scope

Features: #3, #4
Own: `packages/limps-headless/src/audit/analyses/migration.ts`, `packages/limps-headless/src/audit/generate-report.ts`
Depend on: Agent 001 for inventory + provider rules
Block: Agent 003 (tests) until report summary shape is final

## Interfaces

### Export

```typescript
// #3
export function analyzeMigration(inventory: ComponentInventory[]): Issue[];

// #4
export interface AuditSummary {
  totalComponents: number;
  backendCounts: Record<HeadlessBackend, number>;
  legacyRadixCount: number;
  migrationReadiness: 'excellent' | 'good' | 'needs-work' | 'urgent';
}
```

### Receive

```typescript
// #1 (Agent 001) ✅ READY
export interface ComponentInventory {
  name: string;
  backend: HeadlessBackend;
  mixedUsage: boolean;
  evidence: string[];
}
```

## Features

### #3: Migration Analysis

TL;DR: Flag Radix usage and mixed backends; compute readiness.
Status: `PASS`
Test IDs: `migration-radix`, `migration-mixed`, `migration-readiness`
Files: `packages/limps-headless/src/audit/analyses/migration.ts` (create)

TDD:
1. `issue generation` → create analyzer → unify issue shape
2. `severity scoring` → add mixed severity rules → centralize scoring
3. `readiness summary` → compute readiness bucket → share with report

Gotchas:
- avoid double-counting mixed components as both radix + mixed

---

### #4: Report + CLI Output Updates

TL;DR: Add backend summary + migration category to report.
Status: `PASS`
Test IDs: `report-backend-summary`, `report-migration-section`
Files: `packages/limps-headless/src/audit/generate-report.ts` (update)

TDD:
1. `summary extension` → add backend counts → isolate aggregator
2. `migration section` → include migration issues → add category registry
3. `compatibility guard` → snapshot report JSON → stabilize output ordering

Gotchas:
- ensure old JSON keys remain unchanged for consumers

---

## Done

- [x] Migration issues appear in report
- [x] Summary includes backend counts
- [x] Status → PASS
