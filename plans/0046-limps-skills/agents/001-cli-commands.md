---
title: CLI Commands
status: GAP
persona: coder
depends_on: [000]
files:
  - src/cli/commands/skill/list.ts
  - src/cli/commands/skill/show.ts
  - src/cli/commands/skill/read.ts
  - src/cli/commands/skill/index.ts
tags: [skills, cli]
---

# Agent 001: CLI Commands

## Objective

Implement CLI commands for skill management: list, show, read.

## Tasks

1. **skill list** (`src/cli/commands/skill/list.ts`)
   - Display all bundled skills with name and description
   - Support `--json` output for scripting
   - Format: table with name, description (truncated), version

2. **skill show** (`src/cli/commands/skill/show.ts`)
   - Display full metadata for single skill
   - Show frontmatter fields: name, description, version, tags, allowed-tools
   - Include file counts for references/ and templates/

3. **skill read** (`src/cli/commands/skill/read.ts`)
   - Output full SKILL.md content to stdout
   - Support `--resource <path>` to read specific resource file
   - Useful for piping into AI context

4. **Command registration** (`src/cli/commands/skill/index.ts`)
   - Register all skill commands under `limps skill`
   - Add help text and examples

## Acceptance Criteria

- [ ] `limps skill list` shows all skills in table format
- [ ] `limps skill show limps-planning` displays metadata
- [ ] `limps skill read limps-planning` outputs SKILL.md
- [ ] All commands execute in < 100ms
- [ ] `--help` works for all commands

## Example Output

```
$ limps skill list
NAME             DESCRIPTION                                    VERSION
limps-planning   Guide for using limps MCP planning tools...    1.0.0
limps-analysis   Guide for analyzing plans and progress...      1.0.0
```
