---
title: Documentation
status: GAP
persona: coder
depends_on: [000, 001, 002, 003, 004, 005]
files:
  - docs/skills.md
  - docs/skill-authoring.md
  - README.md
tags: [skills, documentation]
---

# Agent 006: Documentation

## Objective

Document the skills system for users and skill authors.

## Tasks

1. **Skills overview** (`docs/skills.md`)
   - What are skills and why they matter
   - Bundled skills list and descriptions
   - CLI command reference
   - MCP tool reference

2. **Skill authoring guide** (`docs/skill-authoring.md`)
   - SKILL.md format specification
   - Frontmatter fields (required vs optional)
   - Best practices for description (WHAT + WHEN)
   - Progressive disclosure tips
   - Example skill walkthrough

3. **README updates** (`README.md`)
   - Add skills section
   - Link to detailed docs
   - Quick start for using bundled skills

## Content Sections

### docs/skills.md
- Introduction to limps skills
- Using bundled skills (list, show, read, export)
- Multi-agent export targets
- Auto-install behavior
- Configuration options

### docs/skill-authoring.md
- SKILL.md anatomy
- Frontmatter reference
- Best practices checklist
- Testing your skill
- Publishing considerations

## Acceptance Criteria

- [ ] docs/skills.md covers all CLI commands
- [ ] docs/skill-authoring.md enables users to create skills
- [ ] README links to skill documentation
- [ ] All commands have examples
- [ ] Follows existing docs style
