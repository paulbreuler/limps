---
title: limps Skills Distribution System
status: draft
workType: feature
tags: [limps/plan, limps/worktype/feature, limps/priority/high, skills, npm, distribution]
created: 2026-02-02
updated: 2026-02-02
depends_on: []
---

# limps Skills Distribution System

## The Problem

Users can't easily get limps guidance into their AI agents. Current state:

1. **Clone the repo** — Friction, requires git, manual updates
2. **Copy-paste SKILL.md** — Error-prone, no versioning
3. **No progressive disclosure** — Full skill dumps context window
4. **Single-agent** — Only works with Claude Code, not Cursor/Codex/Windsurf

**The goal**: `npm install @sudosandwich/limps` just works™. Skills auto-load, update with package.

## Design Philosophy: Skills as Bundled Knowledge

Following Anthropic's Agent Skills Standard and the ecosystem patterns:

**Skills are "brain" (procedural memory)** — How to do things
**MCP is "plumbing" (tool access)** — What can be done
**Documents are "context" (semantic memory)** — What is known

This plan focuses on the "brain" layer — teaching AI agents how to use limps effectively.

### Progressive Disclosure Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SKILL LOADING TIERS                          │
├─────────────────────────────────────────────────────────────────┤
│  Tier 1: Metadata (~100 tokens/skill)                           │
│  • name + description from SKILL.md frontmatter                 │
│  • Loaded at startup, always in context                         │
│  • Drives autonomous skill selection                            │
├─────────────────────────────────────────────────────────────────┤
│  Tier 2: Instructions (<5k tokens)                              │
│  • Full SKILL.md body content                                   │
│  • Loaded when skill triggered (user request or agent decision) │
│  • Contains how-to guidance, examples, patterns                 │
├─────────────────────────────────────────────────────────────────┤
│  Tier 3: Resources (unlimited)                                  │
│  • Reference docs, schemas, templates                           │
│  • Loaded only when explicitly accessed                         │
│  • Scripts execute, output enters context (not source)          │
└─────────────────────────────────────────────────────────────────┘
```

## Goals

- **Zero friction**: `npm install` bundles skills automatically
- **Progressive disclosure**: Only load what's needed
- **Multi-agent**: Support Claude, Cursor, Codex, Windsurf, Amp
- **CLI-first**: Commands work standalone, MCP wraps them
- **Updatable**: Package updates bring skill improvements

## Non-Goals

- **Skill marketplace**: Not building a registry (use npm/GitHub)
- **Custom skill runtime**: Skills are static markdown, not executable
- **Skill composition**: Skills don't depend on other skills

## Constraints

- Must follow Anthropic's SKILL.md format for compatibility
- Skills ship in npm package (no separate download)
- CLI commands execute in <100ms
- No network calls for skill loading (local files only)

---

## Feature Set

### #1: Built-in Skills Bundle

**TL;DR**: Ship skills inside the npm package at `dist/skills/`.

**Directory Structure (Package)**:

```
@sudosandwich/limps/
├── dist/
│   ├── index.js
│   └── skills/
│       ├── limps-planning/
│       │   ├── SKILL.md
│       │   ├── references/
│       │   │   ├── tool-reference.md
│       │   │   └── workflow-examples.md
│       │   └── templates/
│       │       └── plan-template.md
│       ├── limps-analysis/
│       │   └── SKILL.md
│       └── limps-review/
│           └── SKILL.md
└── package.json
```

**SKILL.md Format (Anthropic Standard)**:

```yaml
---
name: limps-planning
description: Guide for using limps MCP planning tools. Use when creating plans, managing agents, tracking task status, or analyzing project progress.
version: 1.0.0
author: paulbreuler
tags: [planning, mcp, agent-workflow]
allowed-tools: [create_plan, update_task_status, get_next_task, list_plans, list_agents]
---

# limps Planning Guide

## When to Use This Skill

Use this skill when:
- Creating new feature plans
- Managing agent tasks and status
- Finding the next task to work on
- Reviewing project progress

## Core Workflow

1. **Start a plan**: `create_plan` with name and description
2. **Get work**: `get_next_task` returns highest-priority available task
3. **Update status**: `update_task_status` as you progress (GAP → WIP → PASS)
4. **Review**: `list_agents` and `get_plan_status` for progress

## Tool Reference

### create_plan
Creates a new plan with directory structure...

[continues with detailed guidance]
```

**CLI Commands**:

```bash
limps skill list                    # List all bundled skills
limps skill show limps-planning     # Display skill metadata
limps skill read limps-planning     # Output full SKILL.md content
limps skill export --target claude  # Copy to .claude/skills/
```

Status: `GAP`

---

### #2: Multi-Agent Export

**TL;DR**: Export skills to any supported agent's directory structure.

**Supported Agents**:

| Agent | Target Directory | Format |
|-------|-----------------|--------|
| Claude Code | `.claude/skills/` | SKILL.md |
| Cursor | `.cursor/skills/` | SKILL.md |
| Codex CLI | `.opencode/skill/` | SKILL.md |
| GitHub Copilot | `.github/skills/` | SKILL.md |
| Windsurf | `.windsurf/skills/` | SKILL.md |
| Amp | `.agents/skills/` | SKILL.md |

**Export Command**:

```bash
# Export to specific agent
limps skill export --target claude
limps skill export --target cursor
limps skill export --target all     # All supported agents

# Export specific skill
limps skill export limps-planning --target claude

# Global vs project
limps skill export --target claude --global  # ~/.claude/skills/
limps skill export --target claude           # ./.claude/skills/
```

**Implementation**:

```typescript
interface ExportTarget {
  name: string;
  directory: (global: boolean) => string;
  format: 'skill.md' | 'agents.md';
}

const TARGETS: ExportTarget[] = [
  { name: 'claude', directory: (g) => g ? '~/.claude/skills' : '.claude/skills', format: 'skill.md' },
  { name: 'cursor', directory: (g) => g ? '~/.cursor/skills' : '.cursor/skills', format: 'skill.md' },
  // ...
];

async function exportSkill(skillName: string, target: string, global: boolean) {
  const skill = await loadSkill(skillName);
  const targetDir = TARGETS.find(t => t.name === target)?.directory(global);
  await fs.cp(skill.path, path.join(targetDir, skillName), { recursive: true });
}
```

Status: `GAP`

---

### #3: npm Postinstall Hook

**TL;DR**: Auto-install skills when package is installed.

**package.json Enhancement**:

```json
{
  "name": "@sudosandwich/limps",
  "scripts": {
    "postinstall": "node dist/scripts/install-skills.js"
  },
  "limps": {
    "skills": {
      "autoInstall": true,
      "targets": ["claude"],
      "skills": ["limps-planning", "limps-analysis"]
    }
  }
}
```

**Install Script Logic**:

```typescript
// dist/scripts/install-skills.js
async function postinstall() {
  const config = require('../package.json').limps?.skills;
  if (!config?.autoInstall) return;
  
  const isGlobal = process.env.npm_config_global === 'true';
  const targets = config.targets || ['claude'];
  const skills = config.skills || getAllSkillNames();
  
  for (const target of targets) {
    for (const skill of skills) {
      await exportSkill(skill, target, isGlobal);
    }
  }
  
  console.log(`✓ limps skills installed for: ${targets.join(', ')}`);
}
```

**User Configuration Override**:

Users can disable auto-install:

```bash
npm install @sudosandwich/limps --ignore-scripts
```

Or configure in their own package.json:

```json
{
  "limps": {
    "skills": {
      "autoInstall": false
    }
  }
}
```

Status: `GAP`

---

### #4: Skill Scaffolding

**TL;DR**: Create new skills from template.

```bash
limps skill create my-custom-skill
```

**Generated Structure**:

```
.limps/skills/my-custom-skill/
├── SKILL.md
├── references/
│   └── .gitkeep
└── templates/
    └── .gitkeep
```

**Template SKILL.md**:

```yaml
---
name: my-custom-skill
description: [WHAT it does]. Use when [WHEN to use it].
version: 0.1.0
author: ${git.user.name}
tags: []
allowed-tools: []
---

# My Custom Skill

## When to Use This Skill

Use this skill when:
- [Trigger condition 1]
- [Trigger condition 2]

## Workflow

1. [Step 1]
2. [Step 2]

## Examples

### Example: [Use case name]

[Detailed example]
```

Status: `GAP`

---

### #5: Progressive Loading API

**TL;DR**: Programmatic API for progressive skill loading.

```typescript
import { SkillLoader } from '@sudosandwich/limps';

const loader = new SkillLoader();

// Tier 1: Metadata only (for system prompt)
const skills = await loader.listSkills();
// Returns: [{ name, description, tags }]

// Tier 2: Full instructions (when triggered)
const skill = await loader.loadSkill('limps-planning');
// Returns: { ...metadata, content: string }

// Tier 3: Specific resource (on demand)
const reference = await loader.loadResource('limps-planning', 'references/tool-reference.md');
// Returns: string content
```

**Integration with MCP**:

```typescript
// MCP tool wraps CLI (CLI-first pattern); use execFile + validation to avoid command injection
export const loadSkillTool: MCPTool = {
  name: 'load_skill',
  description: 'Load a limps skill for guidance on using planning tools',
  handler: async ({ skillName }) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(skillName)) throw new Error('Invalid skill name');
    const { stdout } = await execFile('limps', ['skill', 'read', skillName]);
    return stdout;
  }
};
```

Status: `GAP`

---

## Component Design

| Component | Location | Purpose |
|-----------|----------|---------|
| Skill Loader | `src/skills/loader.ts` | Load skills from dist/ |
| Skill Exporter | `src/skills/exporter.ts` | Export to agent directories |
| Install Script | `dist/scripts/install-skills.js` | npm postinstall hook |
| CLI Commands | `src/cli/commands/skill/*` | skill list/show/read/export/create |
| MCP Wrapper | `src/tools/skill.ts` | Thin wrapper for load_skill |

---

## Agent Assignments

| Agent | Title | Depends | Deliverable |
|-------|-------|---------|-------------|
| 000 | Skill Loader Core | — | SkillLoader class, directory structure |
| 001 | CLI Commands | 000 | skill list/show/read commands |
| 002 | Multi-Agent Export | 001 | export command, target detection |
| 003 | npm Postinstall | 002 | Install script, package.json config |
| 004 | Skill Scaffolding | 001 | skill create command, templates |
| 005 | MCP Integration | 000 | load_skill tool wrapper |
| 006 | Documentation | all | Skill authoring guide, CLI reference |

---

## Acceptance Criteria

- [ ] `npm install @sudosandwich/limps` auto-installs skills to .claude/skills/
- [ ] `limps skill list` shows all bundled skills with descriptions
- [ ] `limps skill export --target cursor` works for all supported agents
- [ ] `limps skill create my-skill` scaffolds valid SKILL.md structure
- [ ] Skills follow Anthropic Agent Skills Standard format
- [ ] Progressive loading: metadata < 100 tokens, instructions < 5k tokens

---

## References

- [Anthropic Agent Skills Standard](https://agentskills.io)
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)
- [vercel-labs/skills](https://github.com/vercel-labs/skills) — npx skills CLI
- [antfu/skills-npm](https://github.com/antfu/skills-npm) — npm symlink approach
- [onmax/npm-agentskills](https://github.com/onmax/npm-agentskills) — Multi-agent export
