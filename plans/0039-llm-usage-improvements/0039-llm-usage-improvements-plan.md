---
title: LLM Usage Improvements
status: draft
workType: refactor
tags: [limps/plan, limps/worktype/refactor, ux, mcp]
created: 2026-01-27
updated: 2026-01-27
---

# LLM Usage Improvements

## Overview

Improve limps reliability and UX based on real LLM usage friction: setup clarity, safety in config writes, composable sync architecture, and better human feedback when MCP clients differ.

## Goals

- Reduce friction when connecting MCP clients from different vendors.
- Improve safety and predictability when syncing MCP configs.
- Make sync-mcp extensible without editing branching logic.
- Improve docs/CLI messaging for LLM users.

## Non-Goals

- New MCP transports (HTTP/SSE) for limps.
- Full UI or cloud deployment pipeline.

---

## Feature 1: Composable Client Registry for sync-mcp

### User Story

As a contributor, I want to add a new MCP client by registering a descriptor so I don’t have to edit a chain of conditionals.

### Gherkin

Scenario: registry drives sync behavior
Given a client registry
When I run `limps config sync-mcp --client all`
Then the command iterates clients from the registry
And output matches current behavior

Scenario: print-only client uses registry
Given ChatGPT is print-only
When I run `limps config sync-mcp --client chatgpt`
Then no files are written
And instructions are printed

### TDD Cycles

1. `sync-mcp uses registry for iteration` → impl → refactor
2. `print-only client does not write files` → impl → refactor

---

## Feature 2: Safer Config Writes + Better Error Surfacing

### User Story

As a user, I want sync-mcp to never destroy existing MCP content and to clearly explain why a sync failed.

### Gherkin

Scenario: non-object servers section is preserved
Given an invalid servers section
When I run sync-mcp
Then it errors with a clear message
And does not overwrite the section

Scenario: missing config file explanation
Given a missing project config
When I run sync-mcp
Then the error lists missing configs
And suggests how to fix

### TDD Cycles

1. `reject non-object servers section` → impl → refactor
2. `missing config files are listed in errors` → impl → refactor

---

## Feature 3: LLM-Focused Setup Guidance

### User Story

As an LLM user, I want concise setup instructions that reflect each client’s constraints so I can connect quickly.

### Gherkin

Scenario: README lists client-specific constraints
Given MCP setup docs
Then ChatGPT explains remote connector requirement
And Codex shows TOML format

Scenario: CLI outputs actionable tips
When I run sync-mcp
Then the output states if a client is print-only
And suggests next steps (restart/apply)

### TDD Cycles

1. `README includes client constraints` → update docs → refactor wording
2. `sync output mentions print-only clients` → implement output note → refactor messaging

---

## Feature 4: Agent Close Workflow Alignment

### User Story

As a maintainer, I want close-feature-agent to work with agent-based plans without requiring feature IDs.

### Gherkin

Scenario: Agent close works without feature IDs
Given an agent file with status PASS
When I run /close-feature-agent
Then README status matrix updates
And no MCP task status update is attempted

Scenario: Explicit message for unsupported task status updates
Given plan uses agent IDs only
When I run /close-feature-agent
Then a note explains that update_task_status requires feature IDs

Scenario: run-agent validates agent file paths
Given an invalid --agent path
When I run /run-agent --agent <path>
Then an error explains the file was not found

Scenario: run-agent prints a short checklist
Given an agent file with Files and Tests sections
When I run /run-agent --agent <path>
Then the output includes a brief checklist for LLM execution

### TDD Cycles

1. `close-feature-agent skips update_task_status for agent-only plans` → impl → refactor
2. `close-feature-agent emits note for agent-only status` → impl → refactor
3. `run-agent validates agent path` → impl → refactor
4. `run-agent prints checklist` → impl → refactor

---

## Running List: LLM Usage Issues & Improvements

1. **Sync-mcp branching logic** makes new client support error-prone → registry-driven hooks.
2. **Config overwrite risk** when servers section is malformed → hard fail with clear message.
3. **Different client requirements** (ChatGPT remote connector vs. local stdio) → explicit guidance in docs/CLI.
4. **CLI flag mismatch** (`-f` not recognized) → add alias support for force.
5. **Tooling bug**: `create_plan` created double-prefixed directories (e.g., `0038-0038-*`) → investigate MCP tool output handling.
6. **Run-agent workflow references claim_task** but orchestration is manual → remove claim_task from docs/workflow.
7. **update_task_status expects feature IDs** while agents are manual tasks → clarify close-feature-agent workflow or add agent-aware status updates.

---

## Component Design

| Component | Files | Purpose |
| --- | --- | --- |
| Client registry | `src/cli/mcp-clients.ts` | Client descriptors + handlers |
| Sync command | `src/commands/config/sync-mcp.tsx` | Registry-driven flow |
| Config helpers | `src/cli/config-cmd.ts` | Error handling + config safety |
| Docs | `README.md`, CLI help | LLM setup clarity |
| Tests | `tests/cli/config-cmd.test.ts` | Safety + behavior |

---

## Gotchas

- Print-only clients should never write files or show preview diffs.
- Keep deterministic output order for test stability.

---

## Acceptance Criteria

- sync-mcp uses a registry to drive behavior (no client-specific branching).
- Invalid server sections are rejected without overwriting.
- README/CLI explain client-specific constraints clearly.
- Tests cover registry iteration and error cases.
