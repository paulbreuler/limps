---
title: limps Feature Roadmap
status: active
workType: docs
tags: [limps/plan, limps/worktype/docs]
created: 2026-01-26
updated: 2026-01-27
---

# limps Feature Roadmap

## Vision

**limps** (Local Intelligent MCP Planning Server) solves **context drift between LLM providers**. When developers bounce between Claude, Cursor, Copilot, ChatGPT, etc. - each assistant has amnesia about the project. limps is the shared memory layer.

### What limps is NOT:
- **Not Mintlify/GitBook** - Those are beautiful docs for humans (with AI answering questions)
- **Not a documentation hosting platform** - No public URLs, no themes, no reader analytics

### What limps IS:
- **Shared brain for AI agents** to coordinate across tools
- **Single source of truth** for planning, decisions, and context
- **MCP-native** - Designed for machine consumption first
- **Local-first** - Your data stays on your machine

---

## Competitive Landscape Analysis

### Mintlify (2025 state)
- Self-updating docs (monitors codebase, proposes updates)
- llms.txt for AI readability  
- MCP server generation from docs
- AI-powered search/chat for readers
- $8M+ ARR, 10k+ companies

### GitBook (2025 state)
- GitBook Agent (proactively suggests improvements)
- Adaptive content (personalized docs by user)
- llms.txt + MCP support
- AI Assistant with chat UI
- 30k+ teams

### Key Insight
Both are optimizing for **human readers discovering docs via AI**. limps should optimize for **AI agents working WITH docs as their workspace**.

---

## Feature Roadmap

### Phase 0: Foundation (Current - v1.x)
> ✅ Shipped

| Feature | Status | Notes |
|---------|--------|-------|
| MCP server with 16 tools | ✅ | Document CRUD, plan management, task coordination |
| RLM query support | ✅ | Programmatic document processing with QuickJS sandbox |
| Full-text search (FTS5) | ✅ | SQLite-based indexing |
| Multi-agent coordination | ✅ | Heartbeats, task claiming, file locks |
| CLI interface | ✅ | `limps list-plans`, `limps status`, etc. |
| Multi-project support | ✅ | Config-based project switching |
| Config migration | ✅ | Auto-upgrade pre-v1 configs with versioning |
| MCP client sync | ✅ | `limps config sync-mcp` for Claude Desktop, Cursor, Claude Code |

---

### Phase 1: Obsidian Integration (v1.2)
> Making limps docs first-class Obsidian citizens

**Plans:**
- [0028-limps-obsidian-plugin](./0028-limps-obsidian-plugin/0028-limps-obsidian-plugin-plan.md) - Full plugin with commands, views, graph enhancements
- [0031-limps-obsidian-frontmatter](./0031-limps-obsidian-frontmatter/0031-limps-obsidian-frontmatter-plan.md) - Frontmatter schemas for all file types

| Feature | Priority | Description |
|---------|----------|-------------|
| Obsidian-compatible frontmatter | ✅ | `title`, `tags`, `aliases`, `created`, `updated` for all file types |
| Graph-friendly titles | ✅ | Descriptive node names in graph view |
| Tag taxonomy | ✅ | `limps/plan`, `limps/agent`, `limps/status/*` hierarchy |
| Standard markdown links | ✅ | `[text](path.md)` over wikilinks for broader tool compatibility |
| Dataview compatibility | LOW | Structured queries over limps data |

**Why:** Obsidian is where many devs keep their second brain. limps docs should be browsable there.

---

### Phase 2: LLM Optimization (v1.3)
> Making limps content AI-agent ready

**Plans:**
- [0032-limps-llms-txt](./0032-limps-llms-txt/0032-limps-llms-txt-plan.md) - llms.txt generation, chunking, priority hints

| Feature | Priority | Description |
|---------|----------|-------------|
| `llms.txt` generation | HIGH | Auto-generate llms.txt from plan structure |
| Context-aware chunking | HIGH | Smart splits for context window limits |
| Semantic deduplication | MEDIUM | Avoid feeding LLMs redundant info |
| Priority hints | MEDIUM | Mark content as "always include" vs "on-demand" |
| Token budgeting | LOW | Respect model token limits automatically |

**Why:** When an AI reads limps content, it should get max signal, min noise.

---

### Phase 3: Self-Updating Intelligence (v2.0)
> Mintlify-inspired but for planning docs

**Plans:**
- [0033-limps-self-updating](./0033-limps-self-updating/0033-limps-self-updating-plan.md) - Staleness, drift detection, proposals

| Feature | Priority | Description |
|---------|----------|-------------|
| Stale content detection | HIGH | Flag plans not touched in X days |
| Code-to-plan drift detection | HIGH | Detect when codebase diverges from plan |
| Auto-update proposals | MEDIUM | Suggest frontmatter/status updates |
| Completion inference | MEDIUM | "This agent looks done, should it be PASS?" |
| Dependency graph validation | LOW | Detect broken/circular dependencies |

**Why:** Plans get stale. AI should help keep them fresh.

---

### Phase 4: Enhanced Search & Discovery (v2.1)
> Beyond keyword matching

**Plans:**
- [0029-limps-semantic-search](./0029-limps-semantic-search/0029-limps-semantic-search-plan.md) - sqlite-vec + ollama local embeddings
- [0030-limps-scoring-weights](./0030-limps-scoring-weights/0030-limps-scoring-weights-plan.md) - Configurable task prioritization

| Feature | Priority | Description |
|---------|----------|-------------|
| Semantic search | HIGH | Vector embeddings for concept-based search |
| Cross-document relationships | MEDIUM | Auto-detect related content |
| "Find similar" | MEDIUM | Given this agent, show related work |
| Search history | LOW | What have I searched for before? |
| Faceted filtering | LOW | Filter by status, persona, date, etc. |

**Why:** FTS5 is good but semantic search is table stakes in 2026.

---

### Phase 5: External Integrations (v2.2)
> Connect to the tools devs actually use

**Plans:**
- [0034-limps-integrations](./0034-limps-integrations/0034-limps-integrations-plan.md) - GitHub, Linear, Slack, Discord

| Feature | Priority | Description |
|---------|----------|-------------|
| GitHub/GitLab sync | HIGH | Bi-directional plan ↔ issue sync |
| Linear/Jira sync | HIGH | Import/export tasks |
| Slack notifications | MEDIUM | "Agent #003 was marked PASS" |
| Discord bot | MEDIUM | Query limps from Discord |
| VS Code extension | LOW | Not just Cursor |

**Why:** limps shouldn't be an island.

---

### Phase 6: Team Collaboration (v3.0)
> Beyond single-dev use

**Plans:**
- [0035-limps-team-mode](./0035-limps-team-mode/0035-limps-team-mode-plan.md) - Auth, RBAC, multi-user, audit logs

| Feature | Priority | Description |
|---------|----------|-------------|
| Deployed mode with auth | HIGH | Run limps as a service (research AUTH first!) |
| Multi-user task claiming | HIGH | Prevent two agents claiming same task |
| Audit log | MEDIUM | Who changed what when |
| Role-based access | LOW | Read-only vs read-write users |
| Real-time sync | LOW | Multiple clients, one state |

**Why:** Solo devs → teams is the growth path.

---

### Phase 7: Content Expansion (v3.x)
> Beyond planning docs

**Plans:**
- [0036-limps-content-expansion](./0036-limps-content-expansion/0036-limps-content-expansion-plan.md) - ADRs, runbooks, meetings, knowledge base

| Feature | Priority | Description |
|---------|----------|-------------|
| ADR support | HIGH | Architecture Decision Records as first-class |
| Runbook templates | MEDIUM | Operational docs with executable steps |
| Meeting notes schema | MEDIUM | Structured meeting → action items |
| Knowledge base mode | LOW | Wiki-style docs without agent workflow |
| API reference parsing | LOW | OpenAPI → limps-readable format |

**Why:** Planning is step 1. Knowledge management is the endgame.

---

## Non-Goals (For Now)

Things we're explicitly NOT building:

- **Public hosting** - Not a docs site generator
- **Pretty themes** - It's for machines, not eyeballs  
- **In-browser editor** - Use Obsidian, VS Code, Cursor
- **Analytics dashboard** - Track in the tools you use
- **AI chatbot UI** - The MCP IS the interface

---

## Success Metrics

| Metric | Target | Why |
|--------|--------|-----|
| MCP tool calls/day | Track usage | Are agents actually using this? |
| Plans → PASS rate | >60% | Do plans get completed? |
| Context drift reduction | Qualitative | Are Claude/Cursor/Copilot in sync? |
| Obsidian graph navigability | Qualitative | Can you visually explore plans? |
| Time to first task | <5 min | Fast onboarding for new projects |

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|----------|
| Vector DB | **sqlite-vec** | All local, no external deps, fits SQLite-first architecture |
| Embedding model | **Local (ollama)** | Privacy-first, no API costs, works offline |
| Obsidian strategy | **Build a plugin** | First-class UX, not just file compat |
| Cross-references | **Standard markdown links** | Wikilinks not globally recognized; `[text](path.md)` works in GitHub, VS Code, etc. |

## Open Questions

1. **Auth strategy for deployed mode** - JWT? OAuth? API keys?
2. **GitHub sync granularity** - Full sync or selective?
3. **Ollama model choice** - nomic-embed-text? mxbai-embed-large? all-minilm?

---

## Status

Status: Planning
Work Type: roadmap
Created: 2026-01-26
