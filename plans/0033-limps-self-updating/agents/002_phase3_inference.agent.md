---
title: Phase 3 - Status Inference
status: PASS
persona: coder
dependencies:
  - ./001_phase2_drift.agent.md
blocks:
  - '003'
  - '004'
tags:
  - limps/agent
  - limps/status/pass
  - limps/persona/coder
aliases:
  - '#002'
  - Status Inference
created: 2026-02-01T00:00:00.000Z
updated: 2026-02-02T00:00:00.000Z
---






# Agent 002: Phase 3 - Status Inference

**Plan Location**: `plans/0033-limps-self-updating/0033-limps-self-updating-plan.md`

## Scope

Features: Phase 3 - Status Inference  
Own: Rule-based inference engine + confidence scoring + MCP tool

## Critical Context

Inference must be conservative. It should suggest, not auto-apply.

## Features

### #0: Inference rules

TL;DR: GAP/WIP/BLOCKED/PASS heuristics with confidence scores.

### #1: MCP tool `infer_status`

TL;DR: Return suggestions for a plan or agent.

### #2: CLI command `limps health check`

TL;DR: Aggregate staleness + drift + inference findings.

## Done

- [x] Rule engine implemented (conservative: BLOCKED from body text, WIP→PASS when deps PASS)
- [x] `infer_status` tool implemented
- [ ] CLI health check aggregates results (staleness + drift + inference)

<!-- limps:graph-links:start -->
## LIMPS Graph Links

Plan:
- [Plan](../0033-limps-self-updating-plan.md)

Depends on:
- [Agent 001](./001_phase2_drift.agent.md)

Blocks:
- [Agent 003](./003_phase4_proposals.agent.md)
- [Agent 004](./004_phase5_automation.agent.md)

<!-- limps:graph-links:end -->
