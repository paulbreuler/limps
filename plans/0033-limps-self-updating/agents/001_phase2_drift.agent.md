---
title: Phase 2 - Code Drift Detection
status: PASS
persona: coder
dependencies: ["000"]
blocks: ["002", "003", "004"]
tags: [limps/agent, limps/status/pass, limps/persona/coder]
aliases: ["#001", "Drift Detection"]
created: 2026-02-01
updated: 2026-02-02
---

# Agent 001: Phase 2 - Code Drift Detection

**Plan Location**: `plans/0033-limps-self-updating/0033-limps-self-updating-plan.md`

## Scope

Features: Phase 2 - Code Drift  
Own: `files:` parsing + existence checking + suggestions

## Critical Context

Drift detection should be safe and read-only. Suggestions must be best-effort.

## Features

### #0: `files:` frontmatter parsing

TL;DR: Use agent frontmatter to gather referenced file paths.

### #1: Missing file detection

TL;DR: Detect deleted/moved files and attempt fuzzy suggestions.

### #2: MCP tool `check_drift`

TL;DR: Report missing files and suggestions for updates.

### #3: CLI command `limps health drift`

TL;DR: Human + JSON output for drift checks.

## Done

- [x] `files:` parsing consolidated
- [x] Missing file detection implemented
- [x] `check_drift` tool implemented
- [x] CLI command output wired
