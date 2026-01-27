---
title: limps LLM Optimization (llms.txt)
status: draft
workType: feature
tags: [limps/plan, limps/worktype/feature]
created: 2026-01-26
updated: 2026-01-27
---

# limps LLM Optimization (llms.txt)

## Overview

Make limps content maximally useful for AI agents. Auto-generate `llms.txt`, implement smart chunking, and add priority hints so LLMs get max signal with min noise.

## Background

### What is llms.txt?

Proposed by Jeremy Howard (Answer.AI) in Sept 2024, now a de facto standard. A structured file that tells AI readers:
- What to read first
- How to prioritize content
- Where to find key information

Already crawled by ChatGPT, Claude, and other models.

### Why This Matters for limps

limps is MCP-native - designed for machine consumption. But current content is:
- Human-readable markdown (not optimized for context windows)
- No priority signals (LLM doesn't know what's important)
- No chunking hints (may exceed token limits)

---

## Feature Set

### 1. Auto-Generated llms.txt

Generate `llms.txt` at the root of the plans directory:

```markdown
# limps Planning Documents
> AI agent coordination and task tracking for [project-name]

## Quick Start
- [Active Plans](/plans/README.md): Overview of all plans
- [Current Sprint](/plans/active/): Plans in active development

## Plan Structure
Each plan contains:
- `{plan-name}-plan.md` - Full specifications and requirements
- `interfaces.md` - API contracts and type definitions
- `gotchas.md` - Known issues and edge cases
- `agents/` - Task breakdown with status tracking

## Key Files
- [0027-limps-roadmap](/plans/0027-limps-roadmap/0027-limps-roadmap-plan.md): Product roadmap
- [0030-limps-scoring-weights](/plans/0030-limps-scoring-weights/0030-limps-scoring-weights-plan.md): Priority system

## Status Legend
- GAP: Not started
- WIP: In progress  
- PASS: Complete
- BLOCKED: Waiting on dependencies
```

### 2. llms-full.txt

Complete content dump for training/fine-tuning:

```markdown
# Full limps Documentation Export
Generated: 2026-01-26T12:00:00Z
Total documents: 45
Total tokens: ~50,000

---
## plans/0027-limps-roadmap/0027-limps-roadmap-plan.md
[full content]

---
## plans/0027-limps-roadmap/agents/000.agent.md
[full content]
...
```

### 3. Context-Aware Chunking

Smart splits for context window limits:

```typescript
interface ChunkOptions {
  maxTokens: number;        // Target chunk size (default: 4000)
  overlap: number;          // Token overlap between chunks (default: 200)
  preserveHeaders: boolean; // Keep h1/h2 structure intact
  priorityFirst: boolean;   // Put high-priority content in first chunk
}

function chunkDocument(content: string, options: ChunkOptions): Chunk[] {
  // 1. Parse markdown structure
  // 2. Identify natural break points (headers, sections)
  // 3. Score each section by priority
  // 4. Create chunks that fit maxTokens
  // 5. Add overlap for context continuity
  // 6. Return ordered chunks
}
```

### 4. Priority Hints

Frontmatter field to mark content importance:

```yaml
---
title: "Critical API Contract"
llm_priority: high          # high | medium | low | skip
llm_summary: "Authentication flow for OAuth2"
llm_context_required: true  # Always include in context
---
```

Usage in MCP tools:
```typescript
// get_context tool respects priority
tool: "get_context"
params: {
  planId: "0027",
  maxTokens: 8000,
  priorityThreshold: "medium"  // Include high + medium
}
returns: {
  content: "...",
  tokensUsed: 7850,
  documentsIncluded: 12,
  documentsSkipped: 3  // low priority / skip
}
```

### 5. Token Budgeting

Automatic context management:

```typescript
interface TokenBudget {
  total: number;           // Max tokens for response
  reserved: {
    systemPrompt: number;  // Fixed overhead
    userQuery: number;     // Estimated query size
    response: number;      // Leave room for output
  };
  available: number;       // What's left for context
}

function buildContext(budget: TokenBudget, planId: string): string {
  const available = budget.available;
  let context = "";
  let used = 0;
  
  // 1. Always include: plan file summary
  // 2. Add: relevant agents (GAP/WIP first)
  // 3. Add: interfaces.md if space
  // 4. Add: gotchas.md if space
  // 5. Stop when budget exhausted
  
  return context;
}
```

---

## New MCP Tools

### `generate_llms_txt`

```typescript
tool: "generate_llms_txt"
params: {
  format: "standard" | "full" | "minimal";
  outputPath?: string;      // Default: plans/llms.txt
  includePrivate?: boolean; // Skip plans marked private
}
returns: {
  path: string;
  size: number;
  plansIncluded: number;
  tokensEstimated: number;
}
```

### `get_context`

```typescript
tool: "get_context"
params: {
  planId?: string;          // Scope to plan
  query?: string;           // Semantic relevance filter
  maxTokens: number;        // Budget
  priorityThreshold?: "high" | "medium" | "low";
  includeAgents?: boolean;
  includeInterfaces?: boolean;
  includeGotchas?: boolean;
}
returns: {
  context: string;          // Ready-to-use content
  tokensUsed: number;
  sources: Array<{
    path: string;
    priority: string;
    tokensUsed: number;
  }>;
}
```

### `estimate_tokens`

```typescript
tool: "estimate_tokens"
params: {
  path?: string;            // Specific file
  planId?: string;          // Entire plan
  content?: string;         // Raw content
}
returns: {
  tokens: number;
  method: "tiktoken" | "estimate";
}
```

---

## CLI Commands

```bash
# Generate llms.txt
limps llms generate
limps llms generate --full
limps llms generate --output ./docs/llms.txt

# Estimate tokens
limps tokens plans/0027-limps-roadmap/0027-limps-roadmap-plan.md
limps tokens --plan 0027

# Get optimized context
limps context --plan 0027 --max-tokens 8000
```

---

## Configuration

```json
{
  "llm": {
    "autoGenerateLlmsTxt": true,
    "regenerateOnChange": true,
    "defaultMaxTokens": 8000,
    "tokenizer": "cl100k_base",  // OpenAI tokenizer
    "priorityDefaults": {
      "{plan-name}-plan.md": "high",
      "interfaces.md": "high",
      "agents/*.md": "medium",
      "gotchas.md": "low",
      "README.md": "low"
    }
  }
}
```

---

## Implementation Plan

### Phase 1: llms.txt Generation
- [ ] Template for llms.txt format
- [ ] Auto-discovery of plans
- [ ] CLI command `limps llms generate`
- [ ] Regenerate on file changes (watch mode)

### Phase 2: Token Estimation
- [ ] Integrate tiktoken (or approximation)
- [ ] `estimate_tokens` tool
- [ ] Token counts in `list_plans` output

### Phase 3: Priority System
- [ ] `llm_priority` frontmatter field
- [ ] Default priorities by file type
- [ ] Priority-aware sorting

### Phase 4: Smart Chunking
- [ ] Markdown-aware chunking
- [ ] Overlap handling
- [ ] Header preservation

### Phase 5: Context Building
- [ ] `get_context` tool
- [ ] Token budgeting logic
- [ ] Semantic relevance (integrate with 0029)

---

## Success Criteria

- [ ] `llms.txt` generates with useful structure
- [ ] Token estimates within 10% of actual
- [ ] `get_context` returns relevant content under budget
- [ ] Priority hints respected in context building
- [ ] Regenerates automatically on changes

---

## References

- [llms.txt Proposal](https://llmstxt.org/)
- [Mintlify llms.txt](https://mintlify.com/docs/settings/llms-txt)
- [tiktoken](https://github.com/openai/tiktoken)
- [Context Window Best Practices](https://www.anthropic.com/news/claude-2-1-prompting)

---

## Status

Status: Planning
Work Type: feature
Created: 2026-01-26
