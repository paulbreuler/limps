---
title: limps Context Hierarchy & Memory System
status: draft
workType: feature
tags: [limps/plan, limps/worktype/feature, limps/priority/critical, memory, inheritance, context, hierarchy]
created: 2026-02-02
updated: 2026-02-02
depends_on: [0042-Knowledge Graph Foundation]
---

# limps Context Hierarchy & Memory System

## The Problem

AI agents suffer from organizational amnesia:

1. **No inheritance** — Root-level decisions don't cascade to plans/agents
2. **Stateless agents** — Every session starts fresh, no accumulated learning
3. **Context drift** — Plans diverge from vision, agents conflict with each other
4. **No supersession** — Old decisions linger, contradicting new ones
5. **Flat structure** — Everything at same level, no hierarchy

**Root cause**: limps has documents but no context relationships. Adding search doesn't fix the "what should this agent know?" question.

**The goal**: When an agent starts work, it automatically inherits:
- Workspace standards (brand, architecture, NFRs)
- Project context (goals, constraints, tech stack)
- Plan context (scope, dependencies, decisions)
- Its own memory from previous sessions

## Design Philosophy: Context as Inheritance, Not Search

Following Notion's block-based model and LobeHub's white-box memory:

**The key insight**: Context shouldn't be searched — it should be inherited. Like CSS cascading, child documents inherit from parents unless explicitly overridden.

### What We're Building

```
┌─────────────────────────────────────────────────────────────────┐
│                      WORKSPACE                                   │
│  workspace.md — Company-wide standards                          │
│  • Vision, mission, values                                      │
│  • Brand guidelines (terminology, tone)                         │
│  • Architecture principles (ADRs)                               │
│  • Non-functional requirements (security, performance)          │
│  ↓ INHERITS TO ALL PROJECTS                                     │
├─────────────────────────────────────────────────────────────────┤
│                      PROJECT                                     │
│  project.md — Initiative-specific context                       │
│  • Project goals and success metrics                            │
│  • Tech stack constraints                                       │
│  • Team conventions                                             │
│  • Project-level ADRs                                           │
│  ↓ INHERITS TO ALL PLANS (can override workspace)               │
├─────────────────────────────────────────────────────────────────┤
│                        PLAN                                      │
│  {plan}-plan.md — Feature-specific context                      │
│  • Plan scope and boundaries                                    │
│  • Plan-level decisions                                         │
│  • Shared learnings across agents                               │
│  • Plan memory (accumulated during work)                        │
│  ↓ INHERITS TO ALL AGENTS (can override project)                │
├─────────────────────────────────────────────────────────────────┤
│                       AGENT                                      │
│  {agent}.md — Task-specific context                             │
│  • Agent memory (findings, decisions, blockers)                 │
│  • Session history                                              │
│  • Local overrides                                              │
│  ↓ FINAL CONTEXT (most specific wins)                           │
└─────────────────────────────────────────────────────────────────┘
```

### Context Resolution (CSS-like Cascade)

```typescript
// When agent 001 in plan 0042 starts work:
const context = resolveContext('0042', '001');

// Resolution order (later overrides earlier):
// 1. workspace.md (lowest priority)
// 2. project.md (if exists)
// 3. 0042-plan.md
// 4. 001-agent.md (highest priority)
// 5. 001-agent.memory.md (session memory)

// Example: brand_voice defined in workspace, overridden in project
// workspace.md: brand_voice: "professional"
// project.md: brand_voice: "casual"
// → Agent sees: brand_voice: "casual"
```

## Goals

- **Automatic inheritance**: Agents receive ancestor context without explicit inclusion
- **White-box memory**: All memory is markdown, editable, transparent
- **Staleness detection**: Inherited context shows freshness indicators
- **Conflict resolution**: Clear rules when parent/child conflict
- **Session continuity**: Agent memory persists across sessions
- **Plan-level learning**: Shared discoveries across agents

## Non-Goals

- **LLM memory management**: We don't decide what to remember (that's the AI's job)
- **Conversation history**: We store structured findings, not chat logs
- **Cross-workspace inheritance**: Each workspace is isolated
- **Real-time sync**: Memory updates on save, not live

## Constraints

- Pure markdown (no binary formats, no database for content)
- Works offline (no cloud services)
- Memory files are human-readable and git-friendly
- Context resolution < 100ms
- Integrates with Plan 0042's knowledge graph

---

## Feature Set

### #1: Workspace Root Documents

**TL;DR**: Define workspace-level context that cascades everywhere.

**Directory Structure**:

```
.limps/
├── workspace.md           # Core workspace config
├── context/
│   ├── vision.md          # Vision and mission
│   ├── brand.md           # Terminology, tone, style
│   ├── architecture.md    # Technical principles
│   ├── nfrs.md            # Non-functional requirements
│   └── conventions.md     # Code style, PR process
└── adrs/                  # Architecture Decision Records
    ├── ADR-0001-use-sqlite.md
    └── ADR-0002-cli-first.md
```

**workspace.md Schema**:

```yaml
---
name: "limps"
type: workspace
created: 2026-01-01
updated: 2026-02-02
---

# Workspace: limps

## Mission
Build the AI-first company operating system.

## Principles
- CLI-first: Commands work standalone, MCP wraps them
- System-intelligent: Deterministic over AI reasoning in hot paths
- White-box: All data is transparent, editable, git-friendly

## Context Files
The following files provide workspace context to all plans:
- `context/vision.md` — North star goals
- `context/brand.md` — Terminology and voice
- `context/architecture.md` — Technical principles
- `context/nfrs.md` — Security, performance, accessibility

## Active ADRs
Architectural decisions that constrain all work:
- ADR-0001: Use SQLite (not Postgres)
- ADR-0002: CLI-first architecture
- ADR-0003: MIT license

## Defaults
These can be overridden at project/plan/agent level:

```yaml
defaults:
  language: TypeScript
  test_framework: Vitest
  style_guide: Anthropic
  pr_process: squash-merge
```
```

**CLI Commands**:

```bash
limps workspace init                    # Create .limps/ structure
limps workspace show                    # Display resolved workspace context
limps workspace edit vision             # Open vision.md in editor
limps context resolve 0042 001          # Show what agent 001 inherits
```

Status: `GAP`

---

### #2: Context Inheritance Engine

**TL;DR**: Resolve inherited context using CSS-like cascade rules.

**Resolution Algorithm**:

```typescript
interface ContextLayer {
  source: string;           // File path
  priority: number;         // Higher = more specific
  content: Record<string, any>;
  lastModified: Date;
}

async function resolveContext(planId?: string, agentId?: string): Promise<ResolvedContext> {
  const layers: ContextLayer[] = [];
  
  // Layer 1: Workspace (priority 0)
  layers.push(await loadLayer('.limps/workspace.md', 0));
  layers.push(...await loadContextDir('.limps/context/', 0));
  
  // Layer 2: Project (priority 10) — if plan is in a project
  const project = await findProjectForPlan(planId);
  if (project) {
    layers.push(await loadLayer(`projects/${project}/project.md`, 10));
  }
  
  // Layer 3: Plan (priority 20)
  if (planId) {
    layers.push(await loadLayer(`plans/${planId}/${planId}-plan.md`, 20));
    layers.push(await loadLayer(`plans/${planId}/context.md`, 20));
  }
  
  // Layer 4: Agent (priority 30)
  if (agentId) {
    layers.push(await loadLayer(`plans/${planId}/agents/${agentId}.md`, 30));
    layers.push(await loadLayer(`plans/${planId}/agents/${agentId}.memory.md`, 30));
  }
  
  // Merge layers (higher priority wins)
  return mergeLayers(layers);
}
```

**Merge Rules**:

| Conflict Type | Resolution |
|--------------|------------|
| Same key, different values | Higher priority wins |
| List values | Concatenate (child adds to parent) |
| Object values | Deep merge (child overrides specific fields) |
| Explicit `override: true` | Child completely replaces parent |
| Explicit `inherit: false` | Child opts out of parent value |

**Example**:

```yaml
# workspace.md
defaults:
  language: TypeScript
  test_coverage: 80%
  
# project.md  
defaults:
  test_coverage: 90%  # Override
  
# plan.md
defaults:
  language: Python  # Override for this plan
  override: true    # Don't merge, replace entirely
  
# Resolved for agent in this plan:
defaults:
  language: Python
```

**CLI Commands**:

```bash
limps context resolve                   # Show workspace context
limps context resolve 0042              # Show plan 0042's inherited context
limps context resolve 0042 001          # Show agent 001's full context
limps context resolve 0042 001 --diff   # Show what each layer contributed
limps context resolve 0042 001 --json   # Machine-readable output
```

Status: `GAP`

---

### #3: Agent Memory System

**TL;DR**: Persistent memory for agents that survives sessions.

**Memory File Structure**:

```
plans/0042-knowledge-graph/
├── agents/
│   ├── 000-entity-schema.md           # Agent definition
│   ├── 000-entity-schema.memory.md    # Agent memory (auto-created)
│   ├── 001-entity-resolution.md
│   └── 001-entity-resolution.memory.md
└── plan.memory.md                     # Plan-level shared memory
```

**Agent Memory Schema**:

```yaml
---
agent: 000-entity-schema
plan: 0042-knowledge-graph
created: 2026-02-01
updated: 2026-02-02
sessions: 3
---

# Agent Memory: Entity Schema & Storage

## Findings
Things discovered while working on this task:

- SQLite-vec requires specific build flags on M1 Macs
- FTS5 tokenizer affects search quality significantly
- Entity IDs should be content-addressable for deduplication

## Decisions
Choices made during implementation:

| Decision | Choice | Rationale | Date |
|----------|--------|-----------|------|
| Primary key | content hash | Enables dedup | 2026-02-01 |
| Index strategy | covering indexes | Faster lookups | 2026-02-01 |

## Blockers
Current or resolved blockers:

- [x] ~~sqlite-vec build issues~~ — Resolved with vcpkg
- [ ] FTS5 custom tokenizer for code — Needs research

## Session Log
Brief notes from each work session:

### Session 3 — 2026-02-02
- Completed entity schema
- Started on extraction logic
- Need to handle circular refs

### Session 2 — 2026-02-01
- Researched sqlite-vec options
- Decided on content-hash IDs
```

**CLI Commands**:

```bash
limps memory show 0042 001              # Display agent memory
limps memory add 0042 001 finding "SQLite-vec needs build flags"
limps memory add 0042 001 decision "Use content hash" --rationale "Enables dedup"
limps memory add 0042 001 blocker "FTS5 tokenizer" --status open
limps memory session 0042 001 "Completed schema, started extraction"
limps memory clear 0042 001             # Reset memory (with confirmation)
```

**MCP Tools**:

```typescript
// Read agent's memory
tool: "get_agent_memory"
params: { planId: string, agentId: string }
returns: { findings: string[], decisions: Decision[], blockers: Blocker[] }

// Add to memory
tool: "add_memory"
params: { 
  planId: string, 
  agentId: string, 
  type: "finding" | "decision" | "blocker",
  content: string,
  metadata?: Record<string, any>
}
```

Status: `GAP`

---

### #4: Plan-Level Shared Memory

**TL;DR**: Knowledge that spans all agents in a plan.

**Use Cases**:

- Shared discoveries (affects multiple agents)
- Plan-wide decisions
- Cross-cutting concerns
- Lessons learned

**plan.memory.md Schema**:

```yaml
---
plan: 0042-knowledge-graph
created: 2026-01-30
updated: 2026-02-02
contributors: [000, 001, 002]
---

# Plan Memory: Knowledge Graph Foundation

## Shared Discoveries
Findings relevant to multiple agents:

- The arxiv paper shows dependency parsing at 94% of LLM performance
- SpaCy is too heavy; using regex + compromise.js instead
- Graph traversal needs covering indexes for performance

## Plan Decisions
Decisions affecting the entire plan:

| Decision | Choice | Affects Agents | Date |
|----------|--------|----------------|------|
| No LLM in hot path | Deterministic routing | 003, 004 | 2026-01-31 |
| CLI-first | MCP wraps CLI | 004, 005, 006 | 2026-01-31 |

## Lessons Learned
What we'd do differently:

- Should have benchmarked sqlite-vec earlier
- Entity resolution is harder than expected
- Watch mode needs debouncing

## Open Questions
Unresolved issues for the plan:

- [ ] How to handle circular dependencies in graph?
- [ ] Should entity similarity be symmetric?
```

**Automatic Promotion**:

When an agent finding affects others, promote to plan memory:

```bash
limps memory promote 0042 001 finding-3  # Promote specific finding to plan
```

Status: `GAP`

---

### #5: Staleness Detection & Decay

**TL;DR**: Track freshness and flag stale context.

**Staleness Scoring**:

```typescript
interface StalenessConfig {
  warningThreshold: number;   // Days until warning (default: 14)
  criticalThreshold: number;  // Days until critical (default: 30)
  archiveThreshold: number;   // Days until auto-archive (default: 90)
}

function calculateStaleness(doc: Document): StalenessScore {
  const daysSinceUpdate = daysBetween(doc.updated, now());
  const expectedRefreshDays = doc.frontmatter.refresh_interval || 30;
  
  return {
    score: daysSinceUpdate / expectedRefreshDays,  // 0-1 scale
    status: daysSinceUpdate > criticalThreshold ? 'critical' :
            daysSinceUpdate > warningThreshold ? 'warning' : 'fresh',
    lastUpdated: doc.updated,
    recommendedAction: daysSinceUpdate > archiveThreshold ? 'archive' : 'review'
  };
}
```

**Freshness Indicators in Context**:

```typescript
// When resolving context, include staleness info
const resolved = await resolveContext('0042', '001');

// Output includes:
{
  layers: [
    { source: 'workspace.md', staleness: 'fresh', daysOld: 5 },
    { source: 'context/architecture.md', staleness: 'warning', daysOld: 20 },
    { source: '0042-plan.md', staleness: 'fresh', daysOld: 2 },
  ],
  warnings: [
    "⚠️ context/architecture.md is 20 days old (threshold: 14)"
  ]
}
```

**CLI Commands**:

```bash
limps context health                    # Check all context files
limps context health --stale            # Show only stale files
limps context refresh architecture      # Touch file, update timestamp
limps context archive old-context       # Move to .limps/archive/
```

**Integration with Plan 0042**:

Staleness detection feeds into the knowledge graph health checks:

```bash
limps graph health  # Now includes context staleness
# Output:
# ⚠️ STALE [warning]: context/architecture.md (20 days old)
# ⚠️ STALE [critical]: ADR-0003 (45 days old, references deprecated plan)
```

Status: `GAP`

---

### #6: Supersession Chains

**TL;DR**: Track when documents replace others, maintain history.

**Supersession Frontmatter**:

```yaml
---
title: "Use sqlite-vec for vectors"
type: adr
status: accepted
supersedes: [ADR-0003, ADR-0005]  # This replaces these
superseded_by: null                # Not yet replaced
---
```

**Automatic Updates**:

When ADR-0010 supersedes ADR-0003:

```bash
limps adr supersede ADR-0003 ADR-0010
```

This automatically:
1. Sets `ADR-0010.supersedes = [ADR-0003]`
2. Sets `ADR-0003.superseded_by = ADR-0010`
3. Sets `ADR-0003.status = superseded`
4. Updates knowledge graph relationships
5. Warns if anything still references ADR-0003

**Chain Traversal**:

```bash
limps adr history ADR-0010
# ADR-0010 (current)
#   ↑ supersedes ADR-0005
#       ↑ supersedes ADR-0003
#           ↑ supersedes ADR-0001
```

Status: `GAP`

---

### #7: Conflict Detection

**TL;DR**: Detect and surface conflicts in inherited context.

**Conflict Types**:

| Conflict | Detection | Severity |
|----------|-----------|----------|
| Direct contradiction | Same key, incompatible values | critical |
| Stale override | Child overrides stale parent | warning |
| Orphan reference | References superseded/deleted doc | critical |
| Circular supersession | A supersedes B supersedes A | critical |

**Example Detection**:

```yaml
# workspace.md
defaults:
  database: PostgreSQL

# plan.md (conflicting)
defaults:
  database: SQLite
  
# Agent sees conflict warning:
# ⚠️ CONFLICT: defaults.database
#    Workspace says: PostgreSQL
#    Plan says: SQLite (override)
#    Resolution: Using plan value (higher priority)
```

**CLI Commands**:

```bash
limps context conflicts                 # Show all conflicts
limps context conflicts 0042            # Conflicts in plan context
limps context validate                  # Fail CI if conflicts exist
```

Status: `GAP`

---

## Integration with Existing Plans

### Plan 0042: Knowledge Graph Foundation

The context hierarchy provides entities for the knowledge graph:

```typescript
// New entity types
type: 'context'    // workspace.md, project.md, context/*.md
type: 'memory'     // *.memory.md files

// New relationship types
INHERITS_FROM      // plan inherits from workspace
OVERRIDES          // plan overrides workspace value
SUPERSEDES         // ADR supersedes another ADR
REMEMBERS          // agent has memory
```

### Plan 0036: Content Expansion

ADRs from 0036 integrate with supersession chains:

```typescript
// ADR status transitions
proposed → accepted → deprecated → superseded
                    → superseded (direct)
```

### Plan 0033: Self-Updating

Staleness detection enhances self-updating:

```typescript
// Drift detection now includes context
const drifts = [
  ...fileDrifts,        // From 0033
  ...contextDrifts,     // New: stale context
  ...memoryDrifts       // New: contradictory memory
];
```

---

## Directory Structure

**Full limps Structure with Context**:

```
.limps/
├── workspace.md                    # Workspace definition
├── context/                        # Workspace context files
│   ├── vision.md
│   ├── brand.md
│   ├── architecture.md
│   └── nfrs.md
├── adrs/                           # Architecture decisions
│   └── ADR-*.md
├── archive/                        # Archived stale docs
└── projects/                       # Optional project grouping
    └── {project}/
        └── project.md

plans/
├── Roadmap.md
├── {plan-id}/
│   ├── {plan-id}-plan.md
│   ├── plan.memory.md              # Plan-level memory
│   ├── context.md                  # Plan-specific context
│   └── agents/
│       ├── {agent}.md
│       └── {agent}.memory.md       # Agent memory
```

---

## Component Design

| Component | Location | Purpose |
|-----------|----------|---------|
| Context Resolver | `src/context/resolver.ts` | Cascade inheritance |
| Memory Manager | `src/memory/manager.ts` | CRUD for memory files |
| Staleness Checker | `src/context/staleness.ts` | Freshness scoring |
| Conflict Detector | `src/context/conflicts.ts` | Find contradictions |
| Supersession Manager | `src/context/supersession.ts` | Chain tracking |
| CLI Commands | `src/cli/commands/context/*` | context, memory commands |
| MCP Tools | `src/tools/context.ts` | Thin wrappers |

---

## Agent Assignments

| Agent | Title | Depends | Deliverable |
|-------|-------|---------|-------------|
| 000 | Workspace Structure | — | Directory layout, workspace.md schema |
| 001 | Context Resolver | 000 | Inheritance engine, merge rules |
| 002 | Agent Memory | 001 | Memory schema, CRUD operations |
| 003 | Plan Memory | 002 | Shared memory, promotion logic |
| 004 | Staleness Detection | 001 | Scoring, warnings, health CLI |
| 005 | Supersession Chains | 000 | ADR integration, chain traversal |
| 006 | Conflict Detection | 001, 004 | Contradiction finder, validation |
| 007 | Knowledge Graph Integration | all, 0042 | Entity types, relationships |
| 008 | Documentation | all | Context guide, memory best practices |

---

## Acceptance Criteria

- [ ] `limps workspace init` creates .limps/ structure
- [ ] `limps context resolve 0042 001` shows inherited context with sources
- [ ] Agent memory persists across sessions in `{agent}.memory.md`
- [ ] Plan memory captures cross-agent learnings
- [ ] Stale context shows warnings (>14 days) and critical (>30 days)
- [ ] Supersession chains update both directions automatically
- [ ] Conflicts are detected and surfaced in CLI and MCP
- [ ] All context/memory files are markdown (white-box)
- [ ] Integration with Plan 0042 knowledge graph works

---

## References

- [Notion Block Data Model](https://www.notion.so/blog/data-model-behind-notion) — Inheritance patterns
- [LobeHub Memory Architecture](https://lobehub.com/docs/usage/features/agent-market) — White-box memory
- [Claude Code CLAUDE.md](https://docs.anthropic.com/en/docs/claude-code) — Hierarchical config
- [ADR Standards](https://adr.github.io/) — Supersession patterns
- [Mem0 Hybrid Memory](https://mem0.ai/) — Staleness and decay
