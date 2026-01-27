---
title: Composable MCP Client Sync Registry
status: draft
workType: refactor
tags: [limps/plan, limps/worktype/refactor, mcp, cli]
created: 2026-01-27
updated: 2026-01-27
---

# Composable MCP Client Sync Registry

## Overview

Refactor `limps config sync-mcp` from conditionals to a composable client registry so new MCP clients can be added by configuration rather than editing branching logic. Preserve current behavior for Claude Desktop, Cursor, Claude Code, Codex, and ChatGPT.

## Goals

- Replace `if`/`else` chains with a client registry + standardized hooks.
- Centralize client definitions (display name, adapter, print/write behavior, preview support).
- Keep existing adapters unchanged; reuse adapter pattern for file-based clients.
- Keep ChatGPT as print-only instructions; no file writes.
- Maintain safety: never overwrite non-object MCP sections.

## Non-Goals

- Changing MCP server execution behavior or transports.
- Changing adapter behavior beyond minor compatibility updates.
- Adding new MCP clients beyond the current list.

---

## Feature 1: Client Registry + Hook Interface

### User Story

As a contributor, I want to add a new MCP client by registering a descriptor so I don’t have to touch sync-mcp logic scattered across the command.

### Gherkin

Scenario: client registry drives sync behavior
Given the client registry contains "claude" and "cursor"
When I run `limps config sync-mcp --client all`
Then the command iterates over the registry and executes handlers per client
And the output is identical to the previous behavior

Scenario: print-only client is supported
Given the registry contains "chatgpt" with print-only behavior
When I run `limps config sync-mcp --client chatgpt`
Then no files are written
And instructions are printed

### TDD Cycles

1. `sync-mcp uses registry for iteration` → implement registry + adapter mapping → refactor sync-mcp to use hooks.
2. `print-only client does not write files` → add behavior flags → refactor output aggregation.

### Notes

- Prefer a single source of truth for client metadata.
- Keep adapter usage for file-backed clients (Claude, Cursor, Claude Code, Codex).

---

## Feature 2: Registry-Driven Preview + Print

### User Story

As a maintainer, I want preview/print behavior to be client-specific but standardized so adding a new client doesn’t require custom branching.

### Gherkin

Scenario: preview hooks are used when supported
Given a file-backed client with preview support
When I run `limps config sync-mcp --client codex`
Then a preview diff is displayed before confirmation

Scenario: print uses correct format per client
Given Codex uses TOML config
When I run `limps config sync-mcp --client codex --print`
Then TOML is printed

### TDD Cycles

1. `registry uses preview when available` → implement hook dispatch → refactor warning message construction.
2. `registry selects print format by client` → implement print handler → refactor to shared output builder.

---

## Feature 3: Docs + CLI Usage Updates

### User Story

As a user, I want CLI help and README to explain the registry-based behavior and supported clients.

### Gherkin

Scenario: help text unchanged in meaning
When I run `limps config --help`
Then client list still includes codex and chatgpt

Scenario: README explains print-only ChatGPT
Given MCP Client Setup docs
Then ChatGPT instructions mention manual connector setup

### TDD Cycles

1. `help text still lists all clients` → update if needed → refactor text reuse.
2. `README remains accurate` → confirm or adjust docs → refactor wording.

---

## Component Design

| Component | Files | Purpose |
| --- | --- | --- |
| Client registry | `src/cli/mcp-clients.ts` | Client descriptors + handler factories |
| Sync command | `src/commands/config/sync-mcp.tsx` | Registry-driven flow |
| Config helpers | `src/cli/config-cmd.ts` | Existing preview/print/write helpers |
| Tests | `tests/cli/config-cmd.test.ts`, `tests/cli/commands.test.tsx` | Registry behavior + CLI output |

---

## Gotchas

- Ensure registry preserves ordering for deterministic outputs.
- Print-only clients should still be included in client lists without preview diff.
- Warning message should mention no writes for print-only clients.

---

## Acceptance Criteria

- `sync-mcp` logic no longer uses client-specific conditional chains.
- Adding a new client requires only a registry entry + optional handler.
- Existing CLI output remains stable for current clients.
- Tests cover registry iteration and print-only behavior.
