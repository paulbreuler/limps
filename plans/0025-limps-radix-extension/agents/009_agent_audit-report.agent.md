---
title: Audit Report Generation
status: GAP
persona: coder
dependencies:
  - "003"
  - "004"
  - "005"
tags: [limps/agent, limps/status/gap, limps/persona/coder]
aliases: ["#009", "Audit Report Agent"]
created: 2026-01-28
updated: 2026-01-29
files:
  - path: packages/limps-radix/src/audit/types.ts
    action: create
  - path: packages/limps-radix/src/audit/discover-components.ts
    action: create
  - path: packages/limps-radix/src/audit/run-audit.ts
    action: create
  - path: packages/limps-radix/src/audit/generate-report.ts
    action: create
  - path: packages/limps-radix/src/tools/run-audit.ts
    action: create
  - path: packages/limps-radix/src/tools/generate-report.ts
    action: create
  - path: packages/limps-radix/tests/audit-report.test.ts
    action: create
---

# Agent 009: Audit Report Generation

**Plan Location**: `plans/0025-limps-radix-extension/0025-limps-radix-extension-plan.md`

## Scope

Features: Audit report pipeline + component discovery + Radix compliance reporting
Own: `packages/limps-radix/src/audit/*`, tool exposure
Depend on: Analyzer + Differ for source data
Block: None

## Problem

limps-radix lacks a runi-style audit: **get all components from the current implementation** and **compare them against Radix for compliance**. We need (1) discovery that catalogs every React component in the project, (2) audit that when given no files runs discovery then analyzes every component against Radix, and (3) reports that include per-component Radix match and compliance (pass/partial/fail), plus issues and contraventions.

## Expected Behaviors

1. **Discovery (foundation)**  
   Scan configurable dirs (e.g. `src/components`); output component inventory: path, name, export type, props interface, dependencies. No files → audit runs discovery first.

2. **Audit scope**  
   - No `scope.files`: run discovery → analyze every discovered component against Radix → diff → report.  
   - With `scope.files`: skip discovery; analyze only those files → diff → report.

3. **Compare against Radix for compliance**  
   For each component in scope, run analyzer (match primitive, confidence). Report must include per-component compliance (primitive or custom, confidence, pass/partial/fail) and aggregated issues/contraventions.

4. **Report**  
   Markdown + JSON (+ summary). Contents: inventory summary, per-component Radix compliance, issues by priority, contraventions, recommendations.

## Interfaces

### Discovery (internal; optional future MCP tool)

```typescript
interface DiscoveryOptions {
  rootDir?: string;             // Default: "src/components" (relative to cwd)
  includePatterns?: string[];   // Default: ["**/*.tsx", "**/*.jsx"]
  excludePatterns?: string[]; // Default: test/story patterns
}

interface ComponentMetadata {
  path: string;
  name: string;
  exportType?: 'default' | 'named' | 'both';
  propsInterface?: string;
  dependencies?: string[];
}
```

### MCP Tools

```typescript
// radix_run_audit
interface RunAuditInput {
  scope?: {
    files?: string[];           // Omit → run discovery, then analyze all
    primitives?: string[];
    provider?: string;
  };
  discovery?: DiscoveryOptions; // Used when scope.files omitted
  radixVersion?: string;
  outputDir?: string;
  format?: 'json' | 'markdown' | 'both';
}

// radix_generate_report
interface GenerateReportInput {
  inputs: { analysis: string; diff?: string; checkUpdates?: string; };
  outputDir?: string;
  format?: 'json' | 'markdown' | 'both';
  title?: string;
}
```

### Report Output

```typescript
interface AuditReport {
  metadata: { version: string; generatedAt: string; generatedBy: string; };
  summary: {
    totalComponents: number;
    issuesByPriority: Record<'critical'|'high'|'medium'|'low', number>;
    contraventions: number;
  };
  compliance?: Array<{
    path: string;
    name: string;
    primitive: string | null;
    confidence: number;
    status: 'pass' | 'partial' | 'fail';
  }>;
  contraventions: { id: string; type: string; severity: string; description: string; recommendation: string; location?: string; }[];
  issues: { id: string; category: string; priority: string; description: string; recommendation: string; location?: string; }[];
  recommendations: string[];
}
```

## TDD Cycles

1. **Discovery test**  
   Test: discoverComponents scans rootDir and returns inventory (path, name, metadata). Impl: glob + parse exports. Refactor: configurable rootDir/include/exclude.

2. **Report output test**  
   Test: generate-report writes markdown + JSON. Impl: report generator. Refactor: summary.json.

3. **Orchestration + scope test**  
   Test: run-audit with no files runs discovery then analyzes all; with files skips discovery and analyzes only those. Impl: discovery → analyzer per component → diff → report. Refactor: primitives scope.

4. **Radix compliance in report test**  
   Test: report includes per-component Radix match, confidence, and compliance summary. Impl: report consumes analysis and emits compliance section. Refactor: configurable pass/partial/fail thresholds.

5. **Contraventions test**  
   Test: legacy package usage flagged. Impl: rule-based contravention scanning. Refactor: custom rule registry.

## Acceptance Criteria

- [ ] Discovery produces component inventory (path, name, metadata) from configurable dirs.
- [ ] `radix_run_audit` with no files runs discovery then analyzes every discovered component against Radix.
- [ ] `radix_run_audit` with `scope.files` skips discovery and analyzes only listed files.
- [ ] Report includes per-component Radix compliance (match primitive, confidence, pass/partial/fail).
- [ ] Report includes contraventions section and issues by priority.
- [ ] `radix_generate_report` combines precomputed analysis/diff/updates into Markdown + JSON.
- [ ] Outputs usable by LLMs and humans (JSON + Markdown).
