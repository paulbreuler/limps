---
title: Phase 1 - Staleness Detection
status: GAP
persona: coder
dependencies: []
blocks: ["001", "002", "003", "004"]
tags: [limps/agent, limps/status/gap, limps/persona/coder]
aliases: ["#000", "Staleness Detection"]
created: 2026-02-01
updated: 2026-02-01
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

- [ ] Config schema defined
- [ ] Staleness rules implemented
- [ ] `check_staleness` tool implemented
- [ ] CLI command output wired
