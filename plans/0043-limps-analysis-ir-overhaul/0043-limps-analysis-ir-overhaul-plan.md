---
title: limps Analysis IR Overhaul
status: draft
workType: overhaul
tags: [limps/plan, limps/worktype/overhaul, limps/headless, limps/analysis]
created: 2026-01-30
updated: 2026-01-30
---

# limps-analysis-ir-overhaul

## Overview

Overhaul the limps-headless analysis pipeline with a transpiler-grade Component IR and extensible rule engine. The goal is to make Base UI detection precise, explainable, and easy to extend as new patterns emerge, while keeping CLI/MCP outputs stable.

## Goals

- Build a stable Component IR that captures syntactic, semantic, and behavioral evidence.
- Normalize module graph resolution (aliases, re-exports, wrappers) for accurate transitive inference.
- Introduce a ruleset-driven engine with weighted evidence and confidence scoring.
- Keep output compatible while adding evidence traces and rule metadata.
- Make it trivial to add new Base UI or legacy Radix detection rules.

## Non-goals

- Editing application code (e.g., runi) or performing migrations.
- Building codemods or auto-fixers.
- Introducing runtime instrumentation.

## Constraints

- No changes to downstream app code; focus on limps-headless only.
- Maintain backward-compatible JSON fields where possible.
- Keep analysis deterministic and testable with fixtures.

## Technical Stack

| Component | Technology | Why |
|-----------|------------|-----|
| Language | TypeScript 5.9+ | Matches current limps toolchain |
| AST + Types | TypeScript Compiler API (or ts-morph wrapper) | Transpiler-grade parsing + type resolution |
| Module Graph | Custom resolver using tsconfig paths | Handles aliases and re-exports |
| Testing | Vitest | Existing test runner |
| Output | JSON + Markdown | CLI/MCP consumers |

---

## Feature 0: Component IR + Module Graph Foundation

**Status:** PASS

### Description

Define a Component IR that captures imports, JSX usage, props, types, roles, attributes, behaviors, and evidence locations. Build a module graph layer that resolves local wrappers, re-exports, and tsconfig path aliases to support transitive inference.

### Gherkin

```gherkin
Feature: Component IR foundation

  Scenario: Build IR from a component
    Given a component file with exports
    When the IR pass runs
    Then Component IR includes exports, imports, JSX usage, and evidence

  Scenario: Resolve tsconfig aliases
    Given an import using @/components/ui/button
    When module graph resolves dependencies
    Then the target file is linked in the IR graph

  Scenario: Track re-exports
    Given a component re-exports another component
    When module graph resolves exports
    Then the IR contains a transitive edge
```

### TDD Cycles

1. `builds ComponentIR with imports/exports/jsx` -> implement IR model -> refactor into ir/ directory
2. `resolves alias imports via tsconfig` -> implement path resolver -> refactor to resolver util
3. `re-export chain is tracked` -> implement export graph -> refactor into module-graph

### Files

- `packages/limps-headless/src/analysis/ir/types.ts` (create)
- `packages/limps-headless/src/analysis/ir/build-ir.ts` (create)
- `packages/limps-headless/src/analysis/module-graph.ts` (create)
- `packages/limps-headless/src/analysis/ts-program.ts` (create)

---

## Feature 1: Evidence Extraction Passes

**Status:** PASS

### Description

Implement passes that extract syntactic, semantic, and behavioral evidence from the AST and type checker. Evidence types include imports, JSX element usage, prop names, role/data attributes, render/asChild patterns, focus/keyboard behaviors, and portal usage.

### Gherkin

```gherkin
Feature: evidence extraction

  Scenario: Import evidence
    Given a component imports @base-ui/react/tabs
    When evidence extraction runs
    Then evidence includes import:base-ui:tabs

  Scenario: Role evidence
    Given JSX uses role="menu"
    When evidence extraction runs
    Then evidence includes role:menu

  Scenario: Behavior evidence
    Given a component manages roving tabindex
    When evidence extraction runs
    Then evidence includes behavior:roving-tabindex
```

### TDD Cycles

1. `captures import evidence with locations` -> implement import evidence pass -> refactor into pass registry
2. `captures role and data-* evidence` -> implement JSX attribute scan -> refactor into attribute helpers
3. `captures behavior heuristics` -> implement behavior detector -> refactor into behavior matchers

### Files

- `packages/limps-headless/src/analysis/passes/import-evidence.ts` (create)
- `packages/limps-headless/src/analysis/passes/jsx-evidence.ts` (create)
- `packages/limps-headless/src/analysis/passes/behavior-evidence.ts` (create)
- `packages/limps-headless/src/analysis/passes/index.ts` (create)

---

## Feature 2: Rule Engine + Ruleset DSL

**Status:** GAP

### Description

Introduce a rule engine that evaluates evidence against rulesets. Rules are data-driven and composable (any/all/not), with weights and severity. Provide Base UI ruleset as the default and a legacy Radix ruleset for detection.

### Gherkin

```gherkin
Feature: rule engine

  Scenario: Base UI rule match
    Given evidence contains import:base-ui:tabs
    When Base UI ruleset runs
    Then rule base-ui/tabs-import is matched with high confidence

  Scenario: Legacy Radix rule match
    Given evidence contains import:radix-ui:dialog
    When legacy Radix ruleset runs
    Then rule radix/dialog-import is matched

  Scenario: Weighted classification
    Given multiple weak signals
    When ruleset evaluates
    Then classification is "possible" and confidence is low
```

### TDD Cycles

1. `rule predicate any/all/not works` -> implement rule evaluator -> refactor to predicate utils
2. `ruleset returns weighted scores` -> implement scoring -> refactor scoring config
3. `classification thresholds produce strong/possible/none` -> implement classifier -> refactor thresholds into config

### Files

- `packages/limps-headless/src/rules/engine.ts` (create)
- `packages/limps-headless/src/rules/predicates.ts` (create)
- `packages/limps-headless/src/rules/rulesets/base-ui.ts` (create)
- `packages/limps-headless/src/rules/rulesets/radix-legacy.ts` (create)
- `packages/limps-headless/src/rules/types.ts` (create)

---

## Feature 3: Analyzer + Audit Integration

**Status:** GAP

### Description

Wire the IR + rules engine into analyze-component and audit flows. Emit classifications (strong/possible/none) with evidence trace. Maintain existing output keys and add new fields under a versioned extension.

### Gherkin

```gherkin
Feature: analyzer integration

  Scenario: Analyze component uses IR
    Given analyze-component is called
    When analysis runs
    Then IR-driven evidence and rule matches appear in the output

  Scenario: Audit aggregates classifications
    Given audit runs on a project
    When analysis completes
    Then audit summary includes legacy/mixed counts and evidence totals

  Scenario: Backward compatibility
    Given existing JSON consumers
    When output is generated
    Then legacy keys remain unchanged
```

### TDD Cycles

1. `analyze-component includes evidence` -> integrate IR + rules -> refactor analyzer adapter
2. `audit summary aggregates classifications` -> add summary reducer -> refactor summary helpers
3. `legacy output keys preserved` -> add schema snapshot -> refactor output formatter

### Files

- `packages/limps-headless/src/tools/analyze-component.ts` (update)
- `packages/limps-headless/src/audit/run-audit.ts` (update)
- `packages/limps-headless/src/audit/generate-report.ts` (update)
- `packages/limps-headless/src/types/index.ts` (update)

---

## Feature 4: UX + Policy Surface

**Status:** GAP

### Description

Improve UX so unknowns are informational, legacy Radix is explicit, and Base UI is the default. Add CLI flags for ruleset selection, evidence verbosity, and IR debug dump. Provide clear guidance in report output.

### Gherkin

```gherkin
Feature: UX and policy

  Scenario: Base UI default
    Given no ruleset flag
    When analysis runs
    Then Base UI ruleset is selected

  Scenario: Evidence verbosity
    Given --evidence=verbose
    When report prints
    Then evidence locations are included

  Scenario: Debug IR dump
    Given --debug-ir
    When analyze runs
    Then IR is written to the output directory
```

### TDD Cycles

1. `ruleset default to base-ui` -> implement default selection -> refactor config loader
2. `evidence verbosity toggles output` -> implement formatter option -> refactor report printer
3. `debug IR dump` -> implement IR serializer -> refactor output helpers

### Files

- `packages/limps-headless/src/cli/flags.ts` (update)
- `packages/limps-headless/src/cli/commands/analyze.ts` (update)
- `packages/limps-headless/src/cli/commands/audit.ts` (update)
- `packages/limps-headless/src/report/formatters.ts` (update)

---

## Feature 5: Tests + Fixtures

**Status:** GAP

### Description

Create fixtures that cover alias imports, wrappers, re-exports, role-based behavior, and false positives. Add snapshot tests for IR and rules, plus integration tests for analyze/audit.

### Gherkin

```gherkin
Feature: testing coverage

  Scenario: Wrapper inference
    Given a component wraps Base UI
    When analysis runs
    Then classification is strong

  Scenario: Role-only heuristic
    Given a component uses role="menu" without imports
    When analysis runs
    Then classification is possible with low confidence

  Scenario: False positive guard
    Given a layout component with data-state
    When analysis runs
    Then classification is none
```

### TDD Cycles

1. `fixtures compile and load` -> add fixture harness -> refactor fixture utils
2. `IR snapshot tests` -> add IR serializer -> refactor snapshot helpers
3. `ruleset evaluation tests` -> add rule engine tests -> refactor test data
4. `analyze/audit integration tests` -> add CLI harness -> refactor test setup

### Files

- `packages/limps-headless/tests/fixtures/*` (create)
- `packages/limps-headless/tests/ir-build.test.ts` (create)
- `packages/limps-headless/tests/rule-engine.test.ts` (create)
- `packages/limps-headless/tests/analyze-integration.test.ts` (create)
- `packages/limps-headless/tests/audit-integration.test.ts` (create)

---

## Risks + Mitigations

- **Type checker performance**: cache program and reuse source files; avoid per-file program creation.
- **Rule churn**: keep rulesets data-driven and versioned; add regression fixtures.
- **Output drift**: snapshot JSON schema and keep old keys stable.

## Exit Criteria

- IR + module graph are used by analyze/audit flows.
- Base UI ruleset is default and outputs evidence traces.
- Legacy Radix detection is possible without impacting Base UI results.
- Fixtures + tests cover wrappers, aliases, roles, and false positives.
- CLI/MCP output remains stable for existing consumers.
