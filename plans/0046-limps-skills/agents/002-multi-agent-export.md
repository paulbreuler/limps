---
title: Multi-Agent Export
status: GAP
persona: coder
depends_on: [001]
files:
  - src/skills/exporter.ts
  - src/cli/commands/skill/export.ts
tags: [skills, export, multi-agent]
---

# Agent 002: Multi-Agent Export

## Objective

Export skills to any supported AI agent's directory structure (Claude, Cursor, Codex, etc.).

## Tasks

1. **Define export targets** (`src/skills/exporter.ts`)
   - Map agent names to directory conventions
   - Support global (~/) and local (./) paths
   - Handle directory creation

2. **Implement exporter**
   - Copy skill directory to target location
   - Preserve structure (SKILL.md, references/, templates/)
   - Skip existing files unless `--force`

3. **Export CLI command** (`src/cli/commands/skill/export.ts`)
   - `--target <agent>`: claude, cursor, codex, copilot, windsurf, amp, all
   - `--global`: Install to user directory
   - `<skill-name>`: Optional, exports specific skill or all

## Supported Targets

| Agent | Directory |
|-------|-----------|
| claude | `.claude/skills/` |
| cursor | `.cursor/skills/` |
| codex | `.opencode/skill/` |
| copilot | `.github/skills/` |
| windsurf | `.windsurf/skills/` |
| amp | `.agents/skills/` |

## Acceptance Criteria

- [ ] `limps skill export --target claude` copies all skills
- [ ] `limps skill export limps-planning --target cursor` copies one skill
- [ ] `--global` installs to home directory
- [ ] `--target all` exports to all supported agents
- [ ] Existing files are preserved unless `--force`

## Example Usage

```bash
# Export to Claude (project-local)
limps skill export --target claude

# Export to all agents (global)
limps skill export --target all --global

# Export specific skill
limps skill export limps-planning --target cursor
```
