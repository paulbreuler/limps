# AGENTS.md

Codex should use Claude guidance files in this repository as the single source of truth.

## Primary Instructions

- Follow `CLAUDE.md` for architecture, workflows, and command usage.

## Shared Skills and Commands

- Reuse skills from `.claude/skills/*/SKILL.md` via `.agents/skills` (linked to `.claude/skills`).
- Reuse command playbooks from `.claude/commands/*.md` via Codex prompts installed in `~/.codex/prompts`.

## Codex Setup

- Run `npm run assistants:setup-codex` after updating `.claude/commands` or `.claude/skills`.
- Codex slash prompts are invoked as `/prompts:<name>` (example: `/prompts:pr-create`).

## Maintenance Rule

- Keep shared assistant guidance in Claude-owned files above.
- Avoid duplicating command/skill docs for Codex.
