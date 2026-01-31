# Agent 004: Tests + Fixtures

**Plan Location**: `plans/0043-limps-analysis-ir-overhaul/0043-limps-analysis-ir-overhaul-plan.md`

## Scope

Features: #5
Own: `packages/limps-headless/tests/*`
Depend on: Agent 003 for integrated outputs

## Interfaces

### Export

```typescript
// #5
// Test-only exports, no runtime exports
```

### Receive

```typescript
// #3/#4 (Agent 003) ✅ READY
// analyze/audit output schema
```

## Features

### #5: Tests + Fixtures

TL;DR: Add fixtures and snapshot tests for IR, rules, and analyze/audit integration.
Status: `PASS`
Test IDs: `fixtures-harness`, `ir-snapshot`, `ruleset-eval`, `analyze-integration`, `audit-integration`
Files: `packages/limps-headless/tests/fixtures/*` (create), `packages/limps-headless/tests/ir-build.test.ts` (create), `packages/limps-headless/tests/rule-engine.test.ts` (create), `packages/limps-headless/tests/analyze-integration.test.ts` (create), `packages/limps-headless/tests/audit-integration.test.ts` (create)

TDD:

1. `fixtures compile and load` -> impl -> refactor
2. `IR snapshot tests` -> impl -> refactor
3. `ruleset evaluation tests` -> impl -> refactor
4. `analyze/audit integration tests` -> impl -> refactor

Gotchas:

- Keep fixtures minimal to avoid snapshot churn.
- Ensure tests are deterministic across OS paths.

---

## Done

- [ ] TDD cycles pass
- [ ] Status -> PASS
