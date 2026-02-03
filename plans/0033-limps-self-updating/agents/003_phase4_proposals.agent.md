---
title: Phase 4 - Update Proposals
status: PASS
persona: coder
dependencies: ["002"]
blocks: ["004"]
tags: [limps/agent, limps/status/pass, limps/persona/coder]
aliases: ["#003", "Update Proposals"]
created: 2026-02-01
updated: 2026-02-01
---

# Agent 003: Phase 4 - Update Proposals

**Plan Location**: `plans/0033-limps-self-updating/0033-limps-self-updating-plan.md`

## Scope

Features: Phase 4 - Proposal System  
Own: Proposal generation, storage, MCP tools

## Critical Context

Proposals must be reviewable. Auto-apply should be limited to safe updates.

## Features

### #0: Proposal schema

TL;DR: Define proposal model and storage location.

### #1: MCP tools `get_proposals` / `apply_proposal`

TL;DR: List proposals and apply with explicit confirmation.

### #2: CLI `limps proposals`

TL;DR: List and apply proposals from the CLI.

## Done

- [x] Proposal schema finalized
- [x] Tools implemented
- [x] CLI commands wired
