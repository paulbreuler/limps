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
updated: 2026-01-28
files:
  - path: packages/limps-radix/src/audit/run-audit.ts
    action: create
  - path: packages/limps-radix/src/audit/generate-report.ts
    action: create
  - path: packages/limps-radix/src/audit/types.ts
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

Features: Audit report pipeline + tooling
Own: `packages/limps-radix/src/audit/*`, tool exposure
Depend on: Analyzer + Differ tools for source data
Block: None

## Problem

limps-radix is LLM-first but lacks a unified audit pipeline that outputs actionable, human-friendly and machine-friendly reports (Markdown + JSON) for use in plan docs and external tooling (Obsidian/VS Code). We need an orchestrator and report generator similar to runi's audit prototype, with explicit contraventions support.

## Interfaces

### New MCP Tools

```typescript
// radix_run_audit
interface RunAuditInput {
  scope?: {
    files?: string[];            // Optional file paths to analyze
    primitives?: string[];       // Optional primitives subset
    provider?: string;           // Default: "radix"
  };
  radixVersion?: string;         // Default: "latest"
  outputDir?: string;            // Default: ".limps-radix/reports"
  format?: 'json' | 'markdown' | 'both';
}

// radix_generate_report
interface GenerateReportInput {
  inputs: {
    analysis: string;            // Path to analysis JSON
    diff?: string;               // Optional path to diff JSON
    checkUpdates?: string;       // Optional path to update JSON
  };
  outputDir?: string;
  format?: 'json' | 'markdown' | 'both';
  title?: string;
}
```

### Output Types

```typescript
interface AuditReport {
  metadata: {
    version: string;
    generatedAt: string;
    generatedBy: string;
  };
  summary: {
    totalComponents: number;
    issuesByPriority: Record<'critical'|'high'|'medium'|'low', number>;
    contraventions: number;
  };
  contraventions: {
    id: string;
    type: string;                // legacy-package-usage, non-tree-shaking, etc.
    severity: 'high'|'medium'|'low';
    description: string;
    recommendation: string;
    location?: string;
  }[];
  issues: {
    id: string;
    category: string;
    priority: 'critical'|'high'|'medium'|'low';
    description: string;
    recommendation: string;
    location?: string;
  }[];
  recommendations: string[];
}
```

## TDD Cycles

1. **Report output test**
   - Test: generate-report writes markdown + JSON
   - Impl: Create audit/report generator
   - Refactor: Add summary.json for dashboards

2. **Run audit orchestration test**
   - Test: run-audit orchestrates analysis + report
   - Impl: Pipe analyzer/differ outputs to report
   - Refactor: Allow limited scope

3. **Contraventions detection test**
   - Test: legacy package usage flagged
   - Impl: Add rule-based contravention scanning
   - Refactor: Allow custom rule registry

## Acceptance Criteria

- [ ] `radix_run_audit` produces report files in output dir
- [ ] `radix_generate_report` can combine precomputed inputs
- [ ] Report includes contraventions section
- [ ] Outputs usable by LLM + humans (JSON + Markdown)
