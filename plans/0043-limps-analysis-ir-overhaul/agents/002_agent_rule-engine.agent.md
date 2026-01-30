# Agent 002: Rule Engine + Rulesets

**Plan Location**: `plans/0043-limps-analysis-ir-overhaul/0043-limps-analysis-ir-overhaul-plan.md`

## Scope

Features: #2
Own: `packages/limps-headless/src/rules/*`
Depend on: Agent 001 for evidence format
Block: Agent 003 (needs engine + rulesets)

## Interfaces

### Export

```typescript
// #2
export interface Rule;
export interface Ruleset;
export interface RuleMatch;
export interface EvaluationResult;
export function evaluateRuleset(ir: ComponentIR, ruleset: Ruleset): EvaluationResult;
export const baseUiRuleset: Ruleset;
export const radixLegacyRuleset: Ruleset;
```

### Receive

```typescript
// #1 (Agent 001) ✅ READY
// Evidence types + ids
```

## Features

### #2: Rule Engine + Ruleset DSL

TL;DR: Implement predicate-based rule evaluator with weighted scoring and Base UI/Radix rulesets.
Status: `GAP`
Test IDs: `rule-any-all-not`, `ruleset-base-ui`, `ruleset-radix-legacy`, `classification-thresholds`
Files: `packages/limps-headless/src/rules/engine.ts` (create), `packages/limps-headless/src/rules/predicates.ts` (create), `packages/limps-headless/src/rules/rulesets/base-ui.ts` (create), `packages/limps-headless/src/rules/rulesets/radix-legacy.ts` (create), `packages/limps-headless/src/rules/types.ts` (create)

TDD:

1. `rule predicate any/all/not works` -> impl -> refactor
2. `ruleset returns weighted scores` -> impl -> refactor
3. `classification thresholds produce strong/possible/none` -> impl -> refactor

Gotchas:

- Keep rulesets data-driven for easy extension.
- Add version field to rulesets to support future schema changes.

---

## Done

- [ ] TDD cycles pass
- [ ] Exports match interface
- [ ] Status -> PASS
