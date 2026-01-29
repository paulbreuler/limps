---
title: Add Codex + ChatGPT MCP Setup Support
status: PASS
workType: feature
tags:
  - limps/plan
  - limps/worktype/feature
  - mcp
  - codex
  - chatgpt
created: 2026-01-27
updated: 2026-01-27
---

# Add Codex + ChatGPT MCP Setup Support

## Overview

Expand MCP client setup to cover OpenAI Codex and ChatGPT. Codex should be fully automated via `limps config sync-mcp`, while ChatGPT should output a clear manual setup guide that reflects ChatGPT’s MCP connector constraints.

## Goals

- Add Codex MCP config support (TOML-based) with tests and CLI integration.
- Add ChatGPT MCP setup guidance in CLI (`sync-mcp --client chatgpt`) and docs.
- Keep config sync behavior stable for existing clients.

## Non-Goals

- Implement new network transports (HTTP/SSE) for limps.
- Build a ChatGPT connector UI or deployment pipeline.

---

## Feature 1: Codex MCP Client Adapter

### User Story

As a developer using Codex, I want limps to add MCP servers to my Codex `config.toml`, so I don’t have to manually edit TOML.

### Gherkin

Scenario: Add limps MCP servers to Codex config
Given registered limps projects exist
And the Codex config file does not exist
When I run `limps config sync-mcp --client codex`
Then a `~/.codex/config.toml` file is created
And it contains a `[mcp_servers.<project>]` table for each project
And each entry uses the limps `serve --config` command

Scenario: Preserve existing Codex settings
Given a Codex config with existing settings
When I run `limps config sync-mcp --client codex`
Then the existing settings remain
And limps servers are added/updated

### TDD Cycles

1. `configAddCodex writes mcp_servers to config.toml` → implement TOML read/write adapter → refactor adapter extraction.
2. `configAddCodex preserves existing TOML keys` → merge behavior → refactor to shared helper.

### Notes

- Use TOML parser to preserve non-MCP config fields.
- Use `mcp_servers` table structure per Codex docs.

---

## Feature 2: ChatGPT MCP Setup Guidance

### User Story

As a developer using ChatGPT, I want limps to show me the steps and required fields to connect a custom MCP server, since there is no local config file.

### Gherkin

Scenario: Show ChatGPT connector instructions
Given registered limps projects exist
When I run `limps config sync-mcp --client chatgpt --print`
Then I see instructions for creating a ChatGPT custom connector
And I see a per-project server name suggestion
And I see placeholders for remote MCP server URL and auth

Scenario: ChatGPT client does not write files
When I run `limps config sync-mcp --client chatgpt`
Then no local config files are written
And instructions are printed instead

### TDD Cycles

1. `generateChatGptInstructions lists projects and required fields` → implement instructions generator → refactor formatting.
2. `sync-mcp routes chatgpt to instructions only` → implement client routing → refactor shared formatting.

### Notes

- Make the limitation explicit: ChatGPT requires a remote MCP server accessible over HTTPS.

---

## Feature 3: Docs + CLI UX Updates

### User Story

As a user, I want README and CLI help to mention Codex + ChatGPT setup so I can discover the new support.

### Gherkin

Scenario: CLI help lists new clients
When I run `limps config --help`
Then I see `codex` and `chatgpt` in the client list

Scenario: README describes Codex and ChatGPT setup
When I read MCP Client Setup
Then I see Codex instructions referencing `~/.codex/config.toml`
And I see ChatGPT connector instructions with remote MCP requirement

### TDD Cycles

1. `config command usage mentions codex/chatgpt` → update CLI usage → refactor help text.
2. `README includes Codex + ChatGPT setup` → update docs → verify format consistency.

---

## Component Design

| Component | Files | Purpose |
| --- | --- | --- |
| MCP adapter | `src/cli/mcp-client-adapter.ts` | Codex TOML adapter + client registry | 
| Config command | `src/cli/config-cmd.ts` | ChatGPT instructions generator, add codex entry | 
| Sync command | `src/commands/config/sync-mcp.tsx` | Client routing + CLI options update | 
| CLI usage | `src/commands/config/index.tsx` | Help text update | 
| Tests | `tests/cli/config-cmd.test.ts` | Codex + ChatGPT behavior coverage | 
| Docs | `README.md` | MCP setup updates | 

---

## Gotchas

- Codex config is TOML, not JSON. Use a parser to avoid corrupting existing settings.
- ChatGPT custom connectors require a remote MCP server; limps is stdio-only today.

---

## Acceptance Criteria

- `limps config sync-mcp --client codex` updates `~/.codex/config.toml` with limps MCP servers.
- `limps config sync-mcp --client chatgpt` outputs manual setup instructions and does not write files.
- Tests cover Codex config updates and ChatGPT instruction output.
- README and CLI help mention Codex and ChatGPT setup requirements.
