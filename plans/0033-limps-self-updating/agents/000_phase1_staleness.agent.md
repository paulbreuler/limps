---
title: Phase 1 - Staleness Detection
status: PASS
persona: coder
dependencies: []
blocks: ["001", "002", "003", "004"]
tags: [limps/agent, limps/status/pass, limps/persona/coder]
aliases: ["#000", "Staleness Detection"]
created: 2026-02-01
updated: 2026-02-02
---






# Agent 000: Phase 1 - Staleness Detection

**Plan Location**: `plans/0033-limps-self-updating/0033-limps-self-updating-plan.md`

## Scope

Features: Phase 1 - Staleness Detection  
Own: Staleness config + reporting, MCP tool for staleness, CLI surface

## Critical Context

We already track agent `mtime` in the parser. This phase formalizes the policy and exposes it to users.

## Features

### #0: Staleness configuration and report schema

TL;DR: Define config shape and report output for stale agents/plans.

### #1: Staleness detection logic

TL;DR: Apply status-based thresholds to compute stale/warning/critical.

### #2: MCP tool `check_staleness`

TL;DR: Provide staleness report at plan or repo scope.

### #3: CLI command `limps health staleness`

TL;DR: Human + JSON output for staleness checks.

## Done

- [x] Config schema defined
- [x] Staleness rules implemented
- [x] `check_staleness` tool implemented
- [x] CLI command output wired

<!-- limps:graph-links:start -->
## LIMPS Graph Links

Plan:
- [Plan](../0033-limps-self-updating-plan.md)

Depends on:
_No dependencies found_

Blocks:
- [Agent 001](./001_phase2_drift.agent.md)
- [Agent 002](./002_phase3_inference.agent.md)
- [Agent 003](./003_phase4_proposals.agent.md)
- [Agent 004](./004_phase5_automation.agent.md)

<!-- limps:graph-links:end -->
