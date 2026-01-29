---
title: limps Radix Extension Index
tags: [limps/index]
created: 2026-01-26
updated: 2026-01-27
---

# 0025-limps-radix-extension

## Overview

`@sudosandwich/limps-radix` - Radix UI contract extraction, semantic analysis, and drift detection as a limps extension.

**Vision:** Apply runi's "collapse uncertainty into truth" pattern to UI component contracts. Detect when components drift from Radix patterns, verify AI-generated components follow best practices, track breaking changes across Radix releases.

## Dependency Graph

```mermaid
graph TD
    subgraph "Phase 0: Prerequisites"
        P0[limps extension API]
    end

    subgraph "Phase 1: Foundation"
        F1[001: Project Scaffolding]
        F2[002: Type Fetcher]
        F3[003: Type Extractor]
    end

    subgraph "Phase 2: Analysis Engine"
        F4[004: Props Classifier]
        F5[005: Signature Generator]
        F6[006: Cache System]
    end

    subgraph "Phase 3: MCP Tools - Read"
        F7[007: radix_list_primitives]
        F8[008: radix_extract_primitive]
    end

    subgraph "Phase 4: Component Analysis"
        F9[009: Component Analyzer]
        F10[010: Confidence Scorer]
        F11[011: Disambiguator]
        F12[012: radix_analyze_component]
    end

    subgraph "Phase 5: Diff & Updates"
        F13[013: Contract Differ]
        F14[014: radix_diff_versions]
        F15[015: radix_check_updates]
    end

    subgraph "Phase 6: Polish"
        F16[016: Provider Architecture]
        F17[017: CLI Commands]
        F18[018: Documentation]
    end

    P0 --> F1
    F1 --> F2
    F2 --> F3
    F3 --> F4
    F4 --> F5
    F5 --> F6
    
    F6 --> F7
    F6 --> F8
    F5 --> F8
    
    F5 --> F9
    F9 --> F10
    F10 --> F11
    F11 --> F12
    F6 --> F12
    
    F5 --> F13
    F13 --> F14
    F14 --> F15
    F6 --> F15
    
    F12 --> F16
    F14 --> F16
    F16 --> F17
    F17 --> F18
```

## Status Matrix

| # | Feature | Agent | Status | Blocks |
|---|---------|-------|--------|--------|
| 0 | limps extension API | 000 | PASS | All |
| 1 | Project Scaffolding | 000 | PASS | 2-18 |
| 2 | Type Fetcher | 001 | PASS | 3 |
| 3 | Type Extractor | 001 | PASS | 4 |
| 4 | Props Classifier | 001 | PASS | 5 |
| 5 | Signature Generator | 002 | PASS | 6-9, 13 |
| 6 | Cache System | 002 | PASS | 7-8, 12, 15 |
| 7 | radix_list_primitives | 003 | GAP | - |
| 8 | radix_extract_primitive | 003 | GAP | - |
| 9 | Component Analyzer | 004 | GAP | 10 |
| 10 | Confidence Scorer | 004 | GAP | 11 |
| 11 | Disambiguator | 004 | GAP | 12 |
| 12 | radix_analyze_component | 004 | GAP | - |
| 13 | Contract Differ | 005 | GAP | 14 |
| 14 | radix_diff_versions | 005 | GAP | 15 |
| 15 | radix_check_updates | 005 | GAP | - |
| 16 | Provider Architecture | 006 | GAP | 17 |
| 17 | CLI Commands | 006 | GAP | 18 |
| 18 | Documentation | 006 | GAP | - |
| 19 | Unified Package (GTC-004) | 007 | PASS | - |
| 20 | Complex Parsing (GTC-005) | 008 | PASS | - |
| 21 | Audit Report Pipeline | 009 | GAP | - |
| 22 | MVP Release Documentation | 010 | PASS | - |
| 23 | MVP Release Artifacts | 011 | PASS | - |

## Agent Assignments

| Agent | Features | Owns |
|-------|----------|------|
| 000 | #0, #1 | limps extension API, package setup |
| 001 | #2, #3, #4 | `packages/limps-radix/src/fetcher/`, `packages/limps-radix/src/extractor/` |
| 002 | #5, #6 | `packages/limps-radix/src/signatures/`, `packages/limps-radix/src/cache/` |
| 003 | #7, #8 | `packages/limps-radix/src/tools/list-primitives.ts`, `packages/limps-radix/src/tools/extract-primitive.ts` |
| 004 | #9, #10, #11, #12 | `packages/limps-radix/src/analyzer/`, `packages/limps-radix/src/tools/analyze-component.ts` |
| 005 | #13, #14, #15 | `packages/limps-radix/src/differ/`, `packages/limps-radix/src/tools/diff-versions.ts`, `packages/limps-radix/src/tools/check-updates.ts` |
| 006 | #16, #17, #18 | `packages/limps-radix/src/providers/`, `packages/limps-radix/src/cli/`, `packages/limps-radix/docs/` |
| 007 | #19 | `packages/limps-radix/src/fetcher/unified-package.ts` |
| 008 | #20 | `packages/limps-radix/src/extractor/type-resolver.ts`, `packages/limps-radix/src/extractor/forward-ref.ts` |
| 010 | #22 | `packages/limps-radix/README.md` |
| 011 | #23 | `packages/limps-radix/LICENSE` |

## File Links

- [0025-limps-radix-extension-plan.md](./0025-limps-radix-extension-plan.md) - Full specifications
- [interfaces.md](./interfaces.md) - TypeScript contracts
- [gotchas.md](./gotchas.md) - Discovered issues

## Agents

| # | Agent | Features | Status | Files |
|---|-------|----------|--------|-------|
| 000 | [extension-api](./agents/000_agent_extension-api.agent.md) | limps extension API, package scaffolding | PASS | 8 |
| 001 | [extraction](./agents/001_agent_extraction.agent.md) | Type Fetcher, Extractor, Classifier | PASS | 9 |
| 002 | [signatures](./agents/002_agent_signatures.agent.md) | Signature Generator, Cache | PASS | 8 |
| 003 | [read-tools](./agents/003_agent_read-tools.agent.md) | radix_list_primitives, radix_extract_primitive | GAP | 3 |
| 004 | [analyzer](./agents/004_agent_analyzer.agent.md) | Component Analyzer, Scorer, Disambiguator | GAP | 12 |
| 005 | [differ](./agents/005_agent_differ.agent.md) | Contract Differ, radix_diff_versions | GAP | 7 |
| 006 | [polish](./agents/006_agent_polish.agent.md) | Provider arch, CLI, Documentation | GAP | 14 |
| 007 | [unified-package](./agents/007_agent_unified-package.agent.md) | Unified Package (GTC-004) | PASS | 4 |
| 008 | [complex-parsing](./agents/008_agent_complex-parsing.agent.md) | Complex Parsing (GTC-005) | PASS | 5 |
| 010 | [release-docs](./agents/010_agent_release-docs.agent.md) | MVP Release Documentation | PASS | 1 |
| 011 | [release-artifacts](./agents/011_agent_release-artifacts.agent.md) | MVP Release Artifacts | PASS | 1 |
