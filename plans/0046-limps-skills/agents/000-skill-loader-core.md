---
title: Skill Loader Core
status: GAP
persona: coder
depends_on: []
files:
  - src/skills/loader.ts
  - src/skills/types.ts
  - dist/skills/limps-planning/SKILL.md
tags: [skills, loader, core]
---

# Agent 000: Skill Loader Core

## Objective

Build the core skill loading infrastructure that reads SKILL.md files from `dist/skills/` with progressive disclosure support.

## Tasks

1. **Define skill types** (`src/skills/types.ts`)
   - `SkillMetadata`: name, description, version, tags, allowed-tools
   - `SkillContent`: full SKILL.md content
   - `SkillResource`: reference files, templates

2. **Implement SkillLoader class** (`src/skills/loader.ts`)
   - `listSkills()`: Return metadata only (Tier 1)
   - `loadSkill(name)`: Return full content (Tier 2)
   - `loadResource(skill, path)`: Return specific resource (Tier 3)
   - Auto-discover skills from `dist/skills/` directory

3. **Create initial skill** (`dist/skills/limps-planning/SKILL.md`)
   - Follow Anthropic Agent Skills Standard format
   - Include frontmatter with required fields
   - Document core limps workflow

## Acceptance Criteria

- [ ] `SkillLoader.listSkills()` returns array of metadata objects
- [ ] `SkillLoader.loadSkill('limps-planning')` returns full SKILL.md content
- [ ] Skills directory structure follows Anthropic standard
- [ ] Metadata extraction uses < 100 tokens per skill
- [ ] Full skill content uses < 5k tokens

## Technical Notes

- Use gray-matter for frontmatter parsing
- Skills are read-only (no write operations)
- Path resolution must work in both dev and production
