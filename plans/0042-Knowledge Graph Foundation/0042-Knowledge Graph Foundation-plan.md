---
title: Knowledge Graph Foundation
status: draft
workType: feature
tags: [limps/plan, limps/worktype/feature, limps/priority/critical, knowledge-graph, hybrid-retrieval, entity-resolution]
created: 2026-01-30
updated: 2026-01-31
---

# Knowledge Graph Foundation — Full Feature Plan

## The Problem

Plans drift. Features get reinvented. AI can't track overlap. As plan count increases:

1. **Disconnected** — Plans are flat markdown with frontmatter that nothing traverses
2. **Duplicate-prone** — Same feature described differently across plans goes undetected
3. **Retrieval chaos** — Semantic search finds "vibes," misses exact IDs and relationships
4. **Contention-blind** — Two plans modifying same file? No warning until merge conflict

**Root cause:** limps has no relational layer. Adding embeddings on flat files = searchable chaos.

## Design Philosophy: System-Intelligent, Not AI-Intelligent

**Key insight from [Practical GraphRAG (arxiv 2507.03226)](https://arxiv.org/abs/2507.03226):**

> Dependency parsing achieves 94% of LLM-based performance while processing documents orders of magnitude faster and at significantly lower cost.

**Translation:** You don't need AI to be smart. You need the SYSTEM to be smart.

### What We're NOT Building
```
User query → AI reasons about tools → AI picks tool → AI calls MCP → Results
           ↑
           This is the weak link (AI is usually wrong about what to do next)
```

### What We ARE Building
```
File changes → System detects automatically → System surfaces conflicts proactively
                     ↓
              No AI reasoning needed — deterministic

User query → System routes deterministically (regex, not LLM) → Results
                     ↓
              AI just consumes results, doesn't orchestrate
```

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                    HUMAN INTERFACES                              │
│  Obsidian Plugin (graph view, conflict sidebar, notifications)   │
│  CLI (primary interface, the source of truth)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    AI INTERFACES                                 │
│  MCP Server (wraps CLI for AI that can't shell out)             │
│  AI is a CONSUMER, not an ORCHESTRATOR                          │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│              DETERMINISTIC INTELLIGENCE LAYER                    │
│  • Regex-based query routing (no LLM in the loop)               │
│  • Proactive conflict detection (watch mode, no query needed)   │
│  • Dependency parsing for entity extraction (classical NLP)     │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    RETRIEVAL LAYER                               │
│  Semantic │ Lexical │ Graph — fused via RRF                     │
│  System picks weights based on query pattern, not LLM reasoning │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│              ENTITY-RESOLVED KNOWLEDGE GRAPH                     │
│  Plans → Agents → Features → Files → Dependencies               │
│  Built via dependency parsing, NOT LLM extraction               │
└─────────────────────────────────────────────────────────────────┘
```

## Goals

- **Proactive Intelligence**: System detects conflicts without being asked
- **Deterministic Routing**: Regex-based query classification, not LLM reasoning
- **Entity Resolution**: Detect overlap via similarity, surface automatically
- **CLI-First**: CLI is the truth, MCP wraps it for AI consumers
- **Obsidian Integration**: Human UI via Plan 0028, not custom dashboards

## Non-Goals

- **Agentic Orchestration**: No ReAct loops, no "LLM decides what tool to call"
- **LLM in Retrieval Loop**: AI consumes results, doesn't navigate to them
- **Custom UI**: Obsidian is the human UI (see Plan 0028)
- **External Graph DB**: SQLite with proper schema is sufficient

## Constraints

- Local-only (no cloud services)
- SQLite + sqlite-vec (existing stack)
- CLI executes in <500ms for common operations
- Watch mode has <2s latency on file change
- No LLM calls in the hot path (retrieval, routing, detection)

---

## Feature Set

### #1: Entity Schema & Graph Storage

**TL;DR**: Define entities (Plans, Agents, Features, Files, Tags) and relationships in SQLite.

**Entity Extraction via Dependency Parsing (No LLM)**

Following the arxiv paper's approach — classical NLP achieves 94% of LLM performance:

```typescript
// Deterministic extraction - no API calls
function extractEntities(planPath: string): ExtractedEntities {
  const content = readFile(planPath);
  const frontmatter = parseFrontmatter(content);
  
  return {
    // Regex for plan ID from path: "0041-limps-improvements"
    plan: extractPlanId(planPath),
    
    // Parse frontmatter for structured data
    agents: frontmatter.agents || parseAgentFiles(planPath),
    dependencies: frontmatter.depends || [],
    files: frontmatter.files || [],
    tags: frontmatter.tags || [],
    
    // Regex for features: "### #1: Feature Name" with status
    features: extractFeatureHeaders(content),
    
    // SpaCy/compromise for noun phrases (concepts)
    concepts: extractNounPhrases(content),
  };
}
```

**Data Model**

```sql
CREATE TABLE entities (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('plan', 'agent', 'feature', 'file', 'tag', 'concept', 'context', 'memory')),
  canonical_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source_path TEXT,
  content_hash TEXT,
  metadata JSON,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(type, canonical_id)
);

CREATE TABLE relationships (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  metadata JSON,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, target_id, relation_type)
);

-- Indexes for fast traversal
CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_canonical ON entities(canonical_id);
CREATE INDEX idx_rel_source ON relationships(source_id);
CREATE INDEX idx_rel_target ON relationships(target_id);
CREATE INDEX idx_rel_type ON relationships(relation_type);
```

**Relationship Types**

| Relation | Description | Example |
|----------|-------------|--------|
| `CONTAINS` | Parent contains child | plan → agent |
| `DEPENDS_ON` | Requires completion first | agent → agent |
| `MODIFIES` | Will change this file | agent → file |
| `SIMILAR_TO` | Detected similarity | feature → feature |
| `TAGGED_WITH` | Has this tag | plan → tag |
| `INHERITS_FROM` | Context inheritance (Plan 0047) | plan → workspace |
| `OVERRIDES` | Explicitly overrides parent | plan → context |
| `SUPERSEDES` | Replaces older document | ADR → ADR |
| `REMEMBERS` | Agent has memory | agent → memory |

**CLI Commands**

```bash
limps graph reindex              # Full reindex (dependency parsing, no LLM)
limps graph reindex --plan 0041  # Single plan
limps graph reindex --incremental # Only changed files
limps graph stats                # Show entity/relationship counts
limps graph entity plan:0041     # Dump single entity
```

Status: `GAP`

---

### #2: Entity Resolution & Similarity Detection

**TL;DR**: Detect duplicates/similar features using embeddings + fuzzy matching. No LLM in the loop.

**Similarity Calculation (Deterministic)**

```typescript
interface SimilarityScore {
  exact: number;      // Canonical ID match (0 or 1)
  lexical: number;    // Jaccard on tokens (0-1)
  semantic: number;   // Embedding cosine (0-1)
  structural: number; // Shared relationships (0-1)
  combined: number;   // Weighted average
}

// Weights are fixed, not LLM-determined
const WEIGHTS = { exact: 0.4, lexical: 0.2, semantic: 0.3, structural: 0.1 };
```

**Automatic Linking**

When `combined > 0.8`, system automatically creates `SIMILAR_TO` relationship:

```typescript
// Runs during reindex, no query needed
async function resolveEntities(newEntities: Entity[]): Promise<Resolution[]> {
  const resolutions: Resolution[] = [];
  
  for (const entity of newEntities) {
    const candidates = await findSimilarEntities(entity, threshold: 0.7);
    
    for (const candidate of candidates) {
      if (candidate.score.combined > 0.8) {
        // Auto-link
        await createRelationship(entity, candidate, 'SIMILAR_TO', candidate.score.combined);
        resolutions.push({ action: 'linked', entity, candidate });
      } else if (candidate.score.combined > 0.7) {
        // Flag for review
        resolutions.push({ action: 'review', entity, candidate });
      }
    }
  }
  
  return resolutions;
}
```

**CLI Commands**

```bash
limps graph resolve              # Run entity resolution
limps graph similar "auth"       # Find similar entities by name
limps graph duplicates           # List all SIMILAR_TO relationships
```

Status: `GAP`

---

### #3: Deterministic Hybrid Retrieval

**TL;DR**: Fuse semantic, lexical, and graph retrieval via RRF. **System picks strategy via regex, not LLM.**

**Deterministic Query Routing**

```typescript
// NO LLM IN THIS FUNCTION
function classifyQuery(query: string): QueryStrategy {
  // Exact patterns - regex, not AI
  const patterns = {
    lookup: /^(find|get|show|what is)\s+(plan|agent|feature)\s+(\d+|[\w-]+)/i,
    exact_id: /plan\s*#?\d+|agent\s*#?\d+|0\d{3}/i,
    relational: /(depends|blocks|modifies|contains|what.*blocking|blocked by)/i,
    status: /(status|progress|completion|blocked|wip|gap|pass)/i,
    conceptual: /(how|why|explain|describe|similar|like|related)/i,
  };
  
  if (patterns.exact_id.test(query)) {
    return { primary: 'lexical', weights: { lexical: 0.7, graph: 0.2, semantic: 0.1 } };
  }
  if (patterns.relational.test(query)) {
    return { primary: 'graph', weights: { graph: 0.6, lexical: 0.2, semantic: 0.2 } };
  }
  if (patterns.conceptual.test(query)) {
    return { primary: 'semantic', weights: { semantic: 0.6, lexical: 0.2, graph: 0.2 } };
  }
  // Default: balanced hybrid
  return { primary: 'hybrid', weights: { semantic: 0.4, lexical: 0.3, graph: 0.3 } };
}
```

**RRF Fusion**

Per the arxiv paper — RRF merges ranked lists without score normalization:

```typescript
function rrf(rankings: RankedList[], k: number = 60): RankedList {
  const scores = new Map<string, number>();
  
  for (const ranking of rankings) {
    for (let i = 0; i < ranking.length; i++) {
      const id = ranking[i].id;
      scores.set(id, (scores.get(id) || 0) + 1 / (k + i + 1));
    }
  }
  
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ id, score }));
}
```

**CLI Commands**

```bash
limps search "auth improvements"          # Hybrid search
limps search "plan 0041" --strategy lexical  # Force strategy
limps search "what blocks 0041" --verbose    # Show routing decision
```

Status: `PASS`

---

### #4: Proactive Conflict Detection (Watch Mode)

**TL;DR**: System detects conflicts WITHOUT being asked. File watcher + cron, not query-based.

**This is the key differentiator.** Instead of:
```
User: "Are there any conflicts?"
AI: *thinks* *calls tools* *maybe finds something*
```

We get:
```
[File saved]
System: ⚠️ CONFLICT: Plan 0033 Agent 002 and Plan 0041 Agent 001 both modify auth.ts
```

**Conflict Types & Detection**

| Conflict | Detection | Severity |
|----------|-----------|----------|
| File overlap (GAP+GAP) | Two agents list same file | `info` |
| File overlap (WIP+WIP) | Two WIP agents, same file | `critical` |
| Feature duplicate | `SIMILAR_TO` with score > 0.85 | `warning` |
| Circular dependency | Graph cycle detection | `critical` |
| Stale WIP | WIP status, no update in 7+ days | `warning` |
| Orphan dependency | Depends on non-existent agent | `critical` |

**Watch Mode**

```typescript
// File watcher - runs on every save
async function onFileChange(path: string): Promise<void> {
  if (!isPlanOrAgent(path)) return;
  
  // 1. Incremental reindex
  await reindexFile(path);
  
  // 2. Run conflict detection
  const conflicts = await detectConflicts({ scope: path });
  
  // 3. Surface immediately (no query needed)
  for (const conflict of conflicts) {
    if (conflict.severity === 'critical') {
      notify.error(formatConflict(conflict));
    } else if (conflict.severity === 'warning') {
      notify.warn(formatConflict(conflict));
    }
  }
}
```

**CLI Commands**

```bash
limps graph watch                    # Start file watcher
limps graph watch --daemon           # Run as background process
limps graph health                   # One-shot conflict detection
limps graph health --plan 0041       # Scope to plan
limps graph health --severity warning # Filter by severity
```

**Output Format**

```
$ limps graph health

⚠️  CONFLICT [critical]: File contention
    Plan 0033 Agent 002 (Auth Refactor) - WIP
    Plan 0041 Agent 001 (Auth Improvements) - WIP
    Both modify: src/auth.ts, src/login.ts
    Recommendation: Consolidate into single plan or sequence work

⚠️  OVERLAP [warning]: Similar features detected
    Plan 0033 "Staleness Detection" (85% similar)
    Plan 0041 "Health Check System"
    Recommendation: Consider merging or linking

✓  No circular dependencies
✓  No orphan dependencies
✓  2 stale WIP agents (run `limps graph stale` for details)

Summary: 1 critical, 1 warning, 2 info
```

Status: `GAP`

---

### #5: CLI-First Architecture

**TL;DR**: CLI is the truth. MCP wraps CLI for AI consumers. No separate implementations.

**Design Principle**

```
limps CLI (executes logic)
    ↑
    │ wraps (thin layer)
    ↓
MCP Server (exposes CLI to AI that can't shell out)
```

**Every MCP tool is a CLI wrapper:**

```typescript
// MCP tool implementation
export const findContention: MCPTool = {
  name: 'find_contention',
  description: 'Detect file conflicts and feature duplicates',
  handler: async (params) => {
    // Just call CLI
    const result = await exec(`limps graph health --json ${params.planId ? `--plan ${params.planId}` : ''}`);
    return JSON.parse(result.stdout);
  }
};
```

**CLI Reference**

```bash
# Graph management
limps graph reindex [--plan ID] [--incremental] [--force]
limps graph stats
limps graph entity TYPE:ID
limps graph watch [--daemon]

# Health & conflicts
limps graph health [--plan ID] [--severity LEVEL] [--json]
limps graph stale [--days N]
limps graph orphans

# Search & retrieval
limps search QUERY [--strategy TYPE] [--top-k N] [--verbose]
limps trace ENTITY_ID [--direction up|down|both] [--depth N]
limps similar QUERY [--threshold N]

# Entity resolution
limps graph resolve [--threshold N]
limps graph duplicates
limps graph link ENTITY_A ENTITY_B [--type RELATION]
```

Status: `GAP`

---

### #6: Integration Points

**TL;DR**: This plan integrates with existing plans. CLI is shared, intelligence is centralized.

**Plan 0028 (Obsidian Plugin) — Primary Human UI**

Obsidian plugin consumes CLI:

```typescript
// Obsidian plugin calls CLI, doesn't reimplement
class LimpsPlugin extends Plugin {
  async onFileChange(file: TFile) {
    await exec(`limps graph reindex --file "${file.path}"`);
    const health = await exec(`limps graph health --json`);
    this.updateConflictSidebar(JSON.parse(health));
  }
}
```

**Plan 0041 (Semantic Search) — Component**

Plan 0041's semantic search becomes a retrieval component:

```typescript
// Plan 0042 hybrid retriever uses 0041's embeddings
import { SemanticRetriever } from './semantic'; // From Plan 0041

class HybridRetriever {
  constructor(
    private semantic: SemanticRetriever, // Plan 0041
    private lexical: LexicalRetriever,   // Plan 0042
    private graph: GraphRetriever        // Plan 0042
  ) {}
}
```

**Plan 0033 (Self-Updating) — Enhanced by Graph**

Graph enables better drift detection:

```typescript
// Plan 0033 uses graph for file drift detection
const modifiesRelations = await graph.findByType('MODIFIES');
for (const rel of modifiesRelations) {
  if (!fileExists(rel.target.canonical_id)) {
    report.push({ type: 'file_drift', agent: rel.source, file: rel.target });
  }
}
```

**Plan 0030 (Scoring Weights) — Graph-Aware Scoring**

```typescript
// Blocked dependencies reduce score
const blockers = await graph.traverse(agent.id, ['BLOCKED_BY'], maxDepth: 3);
const blockerPenalty = blockers.filter(b => b.status !== 'PASS').length * 10;
score -= blockerPenalty;
```

**Plan 0047 (Context Hierarchy) — Memory & Inheritance**

Graph stores context inheritance and memory relationships:

```typescript
// Context files become entities
entityType: 'context'  // workspace.md, vision.md, etc.
entityType: 'memory'   // *.memory.md files

// Inheritance relationships
relationType: 'INHERITS_FROM'  // plan inherits from workspace
relationType: 'OVERRIDES'      // plan overrides workspace value
relationType: 'SUPERSEDES'     // ADR supersedes another ADR
relationType: 'REMEMBERS'      // agent has memory file
```

Status: `GAP`

---

## Component Design

| Component | Location | Purpose |
|-----------|----------|---------|
| Entity Schema | `src/graph/schema.ts` | Types, validation |
| Graph Storage | `src/graph/storage.ts` | SQLite operations |
| Entity Extractor | `src/graph/extractor.ts` | Dependency parsing (no LLM) |
| Entity Resolver | `src/graph/resolver.ts` | Similarity + auto-linking |
| Hybrid Retriever | `src/retrieval/hybrid.ts` | RRF fusion |
| Query Classifier | `src/retrieval/classifier.ts` | Regex-based routing |
| Conflict Detector | `src/health/conflicts.ts` | Proactive detection |
| File Watcher | `src/health/watcher.ts` | Watch mode |
| CLI Commands | `src/cli/commands/graph/*` | CLI implementation |
| MCP Tools | `src/tools/graph/*` | Thin wrappers around CLI |

---

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Full reindex (100 plans) | <30s | Dependency parsing, no LLM |
| Incremental reindex | <2s | Single file change |
| Hybrid search | <500ms | Deterministic routing |
| Graph traversal (3 hops) | <100ms | SQLite with indexes |
| Conflict detection | <200ms | Cached relationships |
| Watch mode latency | <2s | File change to notification |

---

## Agent Assignments

| Agent | Title | Depends | Deliverable |
|-------|-------|---------|-------------|
| 000 | Entity Schema & Storage | — | SQLite schema, dependency parsing extractor |
| 001 | Entity Resolution | 000 | Similarity scoring, auto-linking |
| 002 | Deterministic Hybrid Retrieval | 000, 0041 | Regex routing, RRF fusion |
| 003 | Proactive Conflict Detection | 001, 002 | Watch mode, health CLI |
| 004 | CLI Architecture | 000-003 | CLI commands, MCP wrappers |
| 005 | Integration | all | Plan 0028/0041/0033/0030 integration |
| 006 | Documentation | all | CLI reference, architecture docs |

---

## What We Removed (And Why)

### ~~Agentic Orchestration~~ (Previously Agent 004)

**Removed because:** "AI is usually wrong about what action to take next. Systems thinking isn't strong."

Instead of:
```
Query → LLM reasons about tools → LLM picks tool → Maybe works
```

We have:
```
Query → Regex classification → Deterministic routing → Always works
```

**The LLM's job is to CONSUME results, not NAVIGATE to them.**

### ~~ReAct Loops~~

**Removed because:** Adds latency, complexity, and failure modes without clear benefit.

If the system is smart, the AI doesn't need to iterate.

### ~~LLM-based Entity Extraction~~

**Removed because:** Paper shows dependency parsing achieves 94% of LLM performance at fraction of cost.

We use classical NLP (regex, SpaCy) for extraction. Embeddings only for similarity.

---

## Acceptance Criteria

- [ ] `limps graph reindex` completes in <30s for 100 plans (no LLM calls)
- [ ] `limps graph health` detects file conflicts, duplicates, circular deps
- [ ] `limps graph watch` surfaces conflicts within 2s of file save
- [ ] `limps search` routes deterministically based on query pattern
- [ ] Entity resolution auto-links features with >80% similarity
- [ ] All MCP tools are thin wrappers around CLI commands
- [ ] Existing tools continue working (non-breaking)

---

## References

- [Practical GraphRAG (arxiv 2507.03226)](https://arxiv.org/abs/2507.03226) — Dependency parsing at 94% of LLM performance
- [SpaCy Dependency Parsing](https://spacy.io/usage/linguistic-features#dependency-parse) — Classical NLP for entity extraction
- [RRF (Reciprocal Rank Fusion)](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf) — Merging ranked lists
