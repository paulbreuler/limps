---
title: limps Headless Pivot
status: draft
workType: overhaul
tags: [limps/plan, limps/worktype/overhaul]
created: 2026-01-29
updated: 2026-01-29
---

# limps-headless-pivot

## Overview

Pivot `@sudosandwich/limps-radix` into `@sudosandwich/limps-headless`: a backend-agnostic auditor for headless component libraries. Base UI is the modern default, Radix is supported as legacy. The system auto-detects backend usage, flags migration debt, and preserves existing audit categories (a11y, perf, deps, storybook).

## Goals

- Support Radix + Base UI in a single audit pipeline
- Auto-detect backend per component and mixed usage
- Add migration analysis and readiness scoring
- Keep CLI entrypoints backward compatible
- Preserve report formats while extending with new sections

## Non-goals

- Automatic code migration or codemods
- Adding additional UI frameworks beyond Base + Radix
- Major changes to limps core server APIs

## Technical Stack

| Component | Technology | Why |
|-----------|------------|-----|
| Language | TypeScript 5.9+ | Matches existing limps toolchain |
| AST/Type Analysis | ts-morph + existing analyzer | Reuse established parsing approach |
| Audit Runner | Node.js | CLI + MCP compatibility |
| Testing | Vitest | Fast, existing usage |
| Reporting | Markdown + JSON | Human + machine output |

---

### #0: Package Identity + Backward Compatibility

Status: `GAP`

### Description

Rename and reposition the package as `@sudosandwich/limps-headless`, while preserving existing `limps radix` commands as deprecated aliases. Ensure config names and docs align with the new headless focus.

### Gherkin

```gherkin
Feature: headless package identity

  Scenario: Install limps-headless
    Given user installs @sudosandwich/limps-headless
    When npm completes
    Then limps-headless is available in node_modules
    And package.json exposes headless CLI entrypoints

  Scenario: Backward compatible CLI alias
    Given user runs limps radix audit
    When the command executes
    Then a deprecation warning is printed
    And the headless audit pipeline runs

  Scenario: New CLI entrypoint
    Given user runs limps headless audit
    When the command executes
    Then the headless audit pipeline runs
```

### TDD Cycles

1. **CLI alias test**
   - Test: `limps radix` routes to headless command
   - Impl: Add alias command, print deprecation warning
   - Refactor: Centralize CLI command registry

2. **Package exports test**
   - Test: headless entrypoints exist in package exports
   - Impl: Update `package.json` exports/bin
   - Refactor: Share version constants between CLI and audit

3. **Config namespace test**
   - Test: `headless` config is read with defaults
   - Impl: Add config schema + defaults
   - Refactor: Merge legacy `radix` config with headless config

### Files

- `packages/limps-headless/package.json` (create/rename)
- `packages/limps-headless/src/cli/index.ts` (create)
- `packages/limps-headless/src/cli/commands/*` (update)
- `packages/limps-headless/src/config.ts` (update)
- `packages/limps-headless/src/index.ts` (update)
- Root `package.json` workspaces (update)
- `packages/limps-headless/` (current package location)

---

### #1: Unified Component Discovery

Status: `GAP`

### Description

Build a single discovery pipeline that scans component files and tags each component with its backend (`radix`, `base`, `mixed`, `unknown`). Detection uses imports, JSX patterns, and re-export tracing, while preserving existing analyzer metadata (size, complexity, exports).

### Gherkin

```gherkin
Feature: unified discovery

  Scenario: Detect Base UI usage
    Given a component imports from @base-ui/react
    When discovery runs
    Then backend is "base"

  Scenario: Detect Radix usage
    Given a component imports from @radix-ui/react-dialog
    When discovery runs
    Then backend is "radix"

  Scenario: Detect mixed usage
    Given a component imports both Radix and Base UI
    When discovery runs
    Then backend is "mixed"
    And mixedUsage is true

  Scenario: Detect unknown usage
    Given a component has no recognized imports or patterns
    When discovery runs
    Then backend is "unknown"

  Scenario: Follow re-exports
    Given a component re-exports a backend component
    When discovery runs
    Then backend is inherited from the source
```

### TDD Cycles

1. **Backend import detection**
   - Test: import-based backend detection works
   - Impl: extend AST import scanner
   - Refactor: consolidate import matching helpers

2. **Pattern-based detection**
   - Test: `asChild` and `render` prop patterns tag backend
   - Impl: add JSX attribute scanning
   - Refactor: track per-file evidence

3. **Mixed/unknown resolution**
   - Test: mixed usage yields `mixed`, absent evidence yields `unknown`
   - Impl: add backend resolver
   - Refactor: isolate resolver in `discover-components.ts`

4. **Re-export tracing**
   - Test: re-exported components inherit backend
   - Impl: follow export maps
   - Refactor: share export resolver with analyzer

### Files

- `packages/limps-headless/src/audit/discover-components.ts` (update)
- `packages/limps-headless/src/audit/types.ts` (update)
- `packages/limps-headless/src/analyzer/*` (reuse/extend)

---

### #2: Backend Providers (Radix + Base)

Status: `GAP`

### Description

Introduce a provider interface for backend-specific rules, metadata, and best practices. Implement Radix provider by adapting current logic; implement Base provider with Base UI patterns and anti-patterns.

### Gherkin

```gherkin
Feature: backend providers

  Scenario: Provider registry
    Given backends are registered
    When discovery resolves a backend
    Then the appropriate provider is returned

  Scenario: Radix provider
    Given backend is "radix"
    When provider loads
    Then Radix metadata and rules are available

  Scenario: Base provider
    Given backend is "base"
    When provider loads
    Then Base UI metadata and rules are available
```

### TDD Cycles

1. **Provider interface test**
   - Test: BackendProvider defines rule hooks
   - Impl: add interface + registry
   - Refactor: normalize provider lookup

2. **Radix provider adaptation**
   - Test: existing Radix checks work via provider
   - Impl: wrap Radix rules
   - Refactor: move constants into provider

3. **Base provider implementation**
   - Test: Base rules execute without errors
   - Impl: add Base rules + metadata
   - Refactor: share rule helpers between providers

### Files

- `packages/limps-headless/src/providers/interface.ts` (update)
- `packages/limps-headless/src/providers/radix.ts` (update)
- `packages/limps-headless/src/providers/base.ts` (create)
- `packages/limps-headless/src/providers/index.ts` (update)

---

### #3: Migration Analysis

Status: `GAP`

### Description

Add a migration analysis category that flags legacy Radix usage, mixed backends, and high-risk patterns. Produce a migration readiness score and actionable tasks.

### Gherkin

```gherkin
Feature: migration analysis

  Scenario: Radix usage flagged
    Given a component is tagged as Radix
    When migration analysis runs
    Then a migration issue is generated

  Scenario: Mixed backend flagged
    Given a component is tagged as mixed
    When migration analysis runs
    Then a high severity issue is generated

  Scenario: Readiness summary
    Given inventory includes Radix components
    When report summary is generated
    Then migration readiness is below "excellent"
```

### TDD Cycles

1. **Issue generation test**
   - Test: Radix components emit migration issues
   - Impl: implement migration analyzer
   - Refactor: unify issue shape with other analyses

2. **Severity scoring test**
   - Test: mixed usage sets severity high
   - Impl: add severity rules
   - Refactor: centralize scoring rules

3. **Readiness summary test**
   - Test: summary computes readiness bucket
   - Impl: add readiness calculator
   - Refactor: move to summary helpers

### Files

- `packages/limps-headless/src/audit/analyses/migration.ts` (create)
- `packages/limps-headless/src/audit/types.ts` (update)
- `packages/limps-headless/src/audit/run-audit.ts` (update)

---

### #4: Report + CLI Output Updates

Status: `GAP`

### Description

Extend report generation to include backend breakdown, migration summary, and new issue category. Keep existing report fields stable for downstream tooling.

### Gherkin

```gherkin
Feature: report updates

  Scenario: Backend summary
    Given a completed audit
    When report is generated
    Then backend counts are included in summary

  Scenario: Migration category
    Given migration issues exist
    When report is generated
    Then migration section appears in output

  Scenario: JSON compatibility
    Given a JSON report consumer
    When report is generated
    Then existing keys remain unchanged
```

### TDD Cycles

1. **Summary extension test**
   - Test: summary includes backend counts
   - Impl: extend report summary builder
   - Refactor: isolate backend aggregation

2. **Migration section test**
   - Test: migration issues are printed and serialized
   - Impl: include migration in report builder
   - Refactor: add category registry

3. **Compatibility guard test**
   - Test: existing report keys preserved
   - Impl: preserve base schema
   - Refactor: add schema snapshot test

### Files

- `packages/limps-headless/src/audit/generate-report.ts` (update)
- `packages/limps-headless/src/tools/generate-report.ts` (update)
- `packages/limps-headless/src/cli/commands/audit.ts` (update)

---

### #5: Config + Policy Enforcement

Status: `GAP`

### Description

Add `--backend` / `--mode` flags and config to enforce Base-only or Radix-legacy allowances. Provide thresholds to fail CI when migration debt exceeds limits.

### Gherkin

```gherkin
Feature: policy enforcement

  Scenario: Enforce Base-only
    Given --backend=base
    When audit finds Radix usage
    Then exit code is non-zero

  Scenario: Allow legacy Radix
    Given --backend=radix-legacy
    When audit finds Radix usage
    Then exit code is zero

  Scenario: Migration debt threshold
    Given migration threshold is set to "high"
    When high severity migration issues exist
    Then audit fails
```

### TDD Cycles

1. **Flag parsing test**
   - Test: backend flag parsed into options
   - Impl: add CLI option parser
   - Refactor: move to shared config loader

2. **Policy failure test**
   - Test: base-only with Radix usage fails
   - Impl: add policy gate
   - Refactor: reuse exit code handling

3. **Threshold test**
   - Test: severity threshold triggers failure
   - Impl: implement threshold checker
   - Refactor: centralize audit gating

### Files

- `packages/limps-headless/src/cli/flags.ts` (update)
- `packages/limps-headless/src/audit/run-audit.ts` (update)
- `packages/limps-headless/src/config.ts` (update)

---

### #6: Tests + Fixtures

Status: `GAP`

### Description

Add test fixtures for Radix, Base UI, and mixed components. Cover discovery, provider rules, migration analysis, report summary, and policy enforcement.

### Gherkin

```gherkin
Feature: test coverage for headless pivot

  Scenario: Radix fixture
    Given Radix fixture components
    When audit runs
    Then backend counts show Radix usage

  Scenario: Base fixture
    Given Base UI fixture components
    When audit runs
    Then backend counts show Base usage

  Scenario: Mixed fixture
    Given mixed fixture components
    When audit runs
    Then migration analysis shows high severity issues
```

### TDD Cycles

1. **Discovery fixtures test**
   - Test: inventory tags backends correctly
   - Impl: add fixtures + discovery tests
   - Refactor: reuse fixture loader

2. **Provider rule tests**
   - Test: provider-specific rules run
   - Impl: add provider test harness
   - Refactor: share mock context

3. **Report snapshot test**
   - Test: JSON report includes migration summary
   - Impl: add report snapshot
   - Refactor: stabilize report ordering

### Files

- `packages/limps-headless/tests/fixtures/*` (create)
- `packages/limps-headless/tests/audit-discovery.test.ts` (create)
- `packages/limps-headless/tests/migration-analysis.test.ts` (create)
- `packages/limps-headless/tests/report-summary.test.ts` (create)
- `packages/limps-headless/tests/policy-enforcement.test.ts` (create)

---

## Risks + Mitigations

- **Package rename churn**: keep deprecated `limps radix` alias for at least one major release.
- **Mixed backend complexity**: surface as explicit high-severity issue rather than hidden behavior.
- **Schema drift**: add snapshot tests for report JSON to prevent breaking changes.

## Exit Criteria

- `limps headless audit` runs and emits backend/migration summary
- Existing Radix workflow still functions with deprecation warning
- Base UI usage is detected and validated against provider rules
- Tests cover discovery, migration analysis, report output, and policy gates
