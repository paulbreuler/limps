# Building AI-first Planning Systems: Architecture Patterns from the Frontier

**Research Date:** 2026-02-02
**Purpose:** Inform limps skills distribution (0046), context hierarchy (0047), and knowledge graph (0042) design

---

## Summary

The emerging AI agent ecosystem has crystallized around key patterns: Anthropic's SKILL.md specification for procedural knowledge, hierarchical memory scoping for context management, and document inheritance for cascading constraints.

**Key insight**: Skills are "brain" (procedural memory), MCP is "plumbing" (tool access), and documents are "context" (semantic memory)—three complementary layers.

---

## Anthropic Agent Skills Standard

Released December 2025, now at agentskills.io. Adopted by Microsoft, OpenAI (Codex CLI), Atlassian, Figma, Cursor, GitHub.

### Progressive Disclosure (Three-Tier Loading)

| Level | When Loaded | Token Cost | Content |
|-------|-------------|------------|---------|
| Metadata | Always (startup) | ~100 tokens/skill | `name` and `description` from frontmatter |
| Instructions | When triggered | <5k tokens | SKILL.md body with guidance |
| Resources | As needed | Unlimited | Bundled files, scripts, references |

### Standard Directory Structure

```
skill-name/
├── SKILL.md        # Required: frontmatter + instructions
├── scripts/        # Executable code (Python/Bash)
├── references/     # Documentation loaded on-demand
└── assets/         # Output templates, icons
```

### SKILL.md Frontmatter

```yaml
---
name: generating-commit-messages  # Max 64 chars, lowercase/hyphens
description: Generates clear commit messages. Use when writing commits.  # WHAT + WHEN
allowed-tools: Read, Grep, Glob   # Optional: restrict tools
disable-model-invocation: true    # Optional: user-only activation
---
```

---

## NPM Skills Distribution

No official `npx skills install` exists. Community solutions:

| Tool | Pattern |
|------|---------|
| vercel-labs/skills | `npx skills add owner/repo --skill name` |
| numman-ali/openskills | `npx openskills install owner/repo` |
| AI-Agent-Skills | Interactive TUI browser |
| antfu/skills-npm | Symlinks from node_modules |

### NPM Postinstall Pattern

```json
{
  "scripts": {
    "postinstall": "node install-skill.js"
  },
  "files": ["SKILL.md", "scripts/", "install-skill.js"]
}
```

### Multi-Agent Directories

| Agent | Skills Directory |
|-------|-----------------|
| Claude | `.claude/skills/` |
| Cursor | `.cursor/skills/` |
| Codex | `.opencode/skill/` |
| Copilot | `.github/skills/` |
| Amp | `.agents/skills/` |

---

## Memory Architecture

Production systems converge on hybrid stores: vector (semantic), graph (relationships), key-value (fast access). Mem0 reports 26% accuracy improvement with 91% lower latency.

### Memory Scoping Hierarchy

| Scope | Purpose | Example |
|-------|---------|---------|
| User-level | Personal preferences | "Always use TypeScript" |
| Agent-level | Individual specialization | "Security-focused reviewer" |
| Project-level | Codebase knowledge | "This project uses MVC" |
| Workspace-level | Org-wide standards | "OWASP Top 10 compliance" |

### Claude Code CLAUDE.md Priority

```
~/.claude/CLAUDE.md              # User preferences (lowest)
/project/CLAUDE.md               # Project conventions
/project/subdir/CLAUDE.md        # Subdirectory overrides
CLAUDE.local.md                  # Private, gitignored (highest)
```

### Staleness Prevention

- Cap learnings at 30 items maximum
- Remove outdated entries monthly
- Merge duplicates aggressively
- Two-phase processing: note-taking → consolidation

---

## Document Hierarchy

ClickUp eight-level hierarchy: Workspace → Space → Folder → List → Task → Subtask → Nested Subtask → Checklist

### Simplified Four-Level Model

```
Workspace (organization)
  └── Project (initiative)
       └── Plan (epic/feature)
            └── Task (implementation)
```

### Root Documents

- Vision documents (goals cascading to objectives)
- Architecture Decision Records (technical constraints)
- Brand guidelines (terminology)
- Non-functional requirements (cross-cutting)

### ADR Supersession Chains

Each ADR links to predecessors it supersedes, creating traceable decision history.

---

## Notion Block Model

Every element is a block with parent-child relationships. Indentation manipulates the render tree.

**Inheritance mechanisms:**
- Permissions cascade: workspace → team → page → block
- Relation properties link across databases
- Rollups aggregate from related items
- Database automations enable property inheritance

---

## Document Drift Prevention

### JIRA Automation (Staleness Detection)

```sql
status = "Waiting for customer" AND updated < -5d
```

### Health Check Pattern

```yaml
Weekly: 15-minute critical indicator scan
Monthly: Comprehensive document review
Quarterly: Deep audit with stakeholder interviews
Triggered: After major milestones
```

### Health Indicators

- **Staleness score**: Days since update vs expected refresh
- **Reference integrity**: Valid internal links %
- **Coverage completeness**: Required sections present
- **Version currency**: Current vs latest version

### Self-Healing Patterns

- Auto-archive stale documents
- Auto-notify owners approaching threshold
- Auto-link orphaned tasks to triage
- Auto-update timestamps on system changes

---

## Licensing

MCP specification and SDKs use MIT. Survey of frameworks:

| Framework | License |
|-----------|---------|
| LangChain, AutoGPT, CrewAI | MIT |
| MCP Specification + SDKs | MIT |
| TensorFlow, SmolAgents | Apache 2.0 |
| PyTorch | BSD-3 |

**Apache 2.0** adds explicit patent grant with retaliation clause.

**Recommendation**: MIT for MCP ecosystem consistency. Apache 2.0 for patent protection on novel algorithms.

---

## Application to limps

This research informed:

- **Plan 0046 (Skills)**: SKILL.md format, progressive disclosure, npm postinstall, multi-agent export
- **Plan 0047 (Context Hierarchy)**: Workspace → project → plan → agent inheritance, memory system, staleness detection, supersession chains
- **Plan 0042 (Knowledge Graph)**: Entity types for context/memory, relationship types for inheritance/supersession

---

## Sources

- [Anthropic Agent Skills Standard](https://agentskills.io)
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)
- [Notion Block Data Model](https://www.notion.so/blog/data-model-behind-notion)
- [LobeHub Memory Architecture](https://lobehub.com/docs)
- [vercel-labs/skills](https://github.com/vercel-labs/skills)
- [onmax/npm-agentskills](https://github.com/onmax/npm-agentskills)
- [Mem0 Hybrid Memory](https://mem0.ai/)
