---
title: Skill Scaffolding
status: GAP
persona: coder
depends_on: [001]
files:
  - src/cli/commands/skill/create.ts
  - src/skills/templates/SKILL.md.template
tags: [skills, scaffolding, templates]
---

# Agent 004: Skill Scaffolding

## Objective

Scaffold new skills from templates with `limps skill create`.

## Tasks

1. **Create skill template** (`src/skills/templates/SKILL.md.template`)
   - Anthropic-compliant frontmatter
   - Placeholder sections for When to Use, Workflow, Examples
   - Comments explaining each section

2. **Implement create command** (`src/cli/commands/skill/create.ts`)
   - Create directory structure: `{name}/SKILL.md, references/, templates/`
   - Populate SKILL.md from template
   - Inject name into frontmatter
   - Attempt to get author from git config

3. **Output location options**
   - Default: `.limps/skills/{name}/`
   - `--output <dir>`: Custom location
   - `--dist`: Create in `dist/skills/` (for bundled skills)

## Acceptance Criteria

- [ ] `limps skill create my-skill` creates valid structure
- [ ] Generated SKILL.md passes Anthropic format validation
- [ ] Author populated from git config if available
- [ ] `--output` allows custom location
- [ ] Refuses to overwrite existing skill

## Generated Structure

```
.limps/skills/my-skill/
├── SKILL.md
├── references/
│   └── .gitkeep
└── templates/
    └── .gitkeep
```
