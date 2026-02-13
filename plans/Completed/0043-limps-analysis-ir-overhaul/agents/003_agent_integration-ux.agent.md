# Agent 003: Integration + UX

**Plan Location**: `plans/0043-limps-analysis-ir-overhaul/0043-limps-analysis-ir-overhaul-plan.md`

## Scope

Features: #3, #4
Own: `packages/limps-headless/src/tools/analyze-component.ts`, `packages/limps-headless/src/audit/*`, `packages/limps-headless/src/cli/*`, `packages/limps-headless/src/report/*`
Depend on: Agent 002 for rule engine + rulesets
Block: Agent 004 (needs stable outputs)

## Interfaces

### Export

```typescript
// #3/#4
export interface AnalyzeResult;
export interface AuditSummary;
```

### Receive

```typescript
// #2 (Agent 002) ✅ READY
// evaluateRuleset(), Ruleset definitions
```

## Features

### #3: Analyzer + Audit Integration

TL;DR: Pipe IR + rules into analyze/audit flows; keep output backward compatible while adding evidence.
Status: `PASS`
Test IDs: `analyze-evidence-output`, `audit-summary-classification`, `output-schema-snapshot`
Files: `packages/limps-headless/src/tools/analyze-component.ts` (update), `packages/limps-headless/src/audit/run-audit.ts` (update), `packages/limps-headless/src/audit/generate-report.ts` (update), `packages/limps-headless/src/types/index.ts` (update)

TDD:

1. `analyze-component includes evidence` -> impl -> refactor
2. `audit summary aggregates classifications` -> impl -> refactor
3. `legacy output keys preserved` -> impl -> refactor

### #4: UX + Policy Surface

TL;DR: Add ruleset selection, evidence verbosity, and debug IR dump to CLI + reports.
Status: `PASS`
Test IDs: `ruleset-default`, `evidence-verbosity`, `debug-ir-dump`
Files: `packages/limps-headless/src/cli/flags.ts` (update), `packages/limps-headless/src/cli/commands/analyze.ts` (update), `packages/limps-headless/src/cli/commands/audit.ts` (update), `packages/limps-headless/src/report/formatters.ts` (update)

TDD:

1. `ruleset default to base-ui` -> impl -> refactor
2. `evidence verbosity toggles output` -> impl -> refactor
3. `debug IR dump` -> impl -> refactor

Gotchas:

- Keep legacy JSON keys intact; add new fields under namespaced keys.
- Ensure CLI flags don\'t conflict with existing options.

---

## Done

- [ ] TDD cycles pass
- [ ] Exports match interface
- [ ] Status -> PASS

<!-- limps:graph-links:start -->
## LIMPS Graph Links

Plan:
- [Plan](../0043-limps-analysis-ir-overhaul-plan.md)

Depends on:
_No dependencies found_

Blocks:
_No blocks found_

<!-- limps:graph-links:end -->
