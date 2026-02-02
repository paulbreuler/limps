---
title: Phase 3 - Status Inference
status: GAP
persona: coder
dependencies: ["001"]
blocks: ["003", "004"]
tags: [limps/agent, limps/status/gap, limps/persona/coder]
aliases: ["#002", "Status Inference"]
created: 2026-02-01
updated: 2026-02-01
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

- [ ] Rule engine implemented
- [ ] `infer_status` tool implemented
- [ ] CLI health check aggregates results
