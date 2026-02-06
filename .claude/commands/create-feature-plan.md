# Create Feature Plan v2.1.0

Generate a TDD plan with verbose planning docs and minimal agent execution files using MCP planning tools.

## LLM Execution Rules

- Use MCP planning tools for all reads/writes; do not write files directly.
- Do not include secrets, tokens, or credentials in plan content.
- Only run `process_doc`/`process_docs` with code you authored or reviewed.


## Invocation

```text
/create-feature-plan
```

## MCP Integration

This command uses limps MCP tools for document management:

- **Server**: `limps`
- **Tools**:
  - `create_plan` - Create the plan structure
  - `create_doc` - Create planning documents ({plan-name}-plan.md, interfaces.md, README.md, gotchas.md)
  - `list_docs` - List existing plans to determine next plan number
  - `process_doc` - Process documents with JavaScript (read, filter, transform, extract)
  - `process_docs` - Process multiple documents with JavaScript (analyze patterns across plans)
  - `search_docs` - Full-text search across documents

**Usage**: Call tools via `call_mcp_tool` with `server: "limps"` and the tool name (e.g., `create_plan`, `create_doc`, etc.)

## Plan Operations Skill

Use `/limps-plan-operations` to keep plan identification and artifact loading consistent:

- `identify-plan` when referencing an existing plan for comparison or migration context
- `resolve-path` to normalize plan names/paths before constructing doc paths
- `load-artifacts` to read plan files, interfaces, README, gotchas, and agents via MCP tools


## Workflow

### Phase 1: Gather Context

Ask user for:

- Project name and scope
- Work type: `refactor` | `overhaul` | `features`
- Tech stack and existing patterns
- Prototype/reference documents
- Known gotchas upfront

### Phase 2: Create Planning Docs (Verbose)

**Use MCP tools for document creation:**

1. **Create plan structure** using `create_plan` (server: `limps`):
   - Plan name: `descriptive-name` (NO numeric prefix)
   - `create_plan` prefixes the next plan number automatically (e.g., `0043-descriptive-name`)
   - If you already have an `NNNN-` prefix, strip it to avoid duplication
   - Description: Brief overview of the plan

2. **Create planning documents** using `create_doc` (server: `limps`):
   - Use template `none` for plan file, interfaces.md, README.md
   - Use template `addendum` for gotchas.md (if template available)
   - Path format: use the directory returned by `create_plan` (typically `plans/NNNN-descriptive-name/filename.md`)

**Plan Number Format**: Zero-padded to 4 digits (0001, 0002, ..., 0007, 0008, ...) for proper lexicographical ordering. Scripts support both padded and unpadded formats for backward compatibility.

**1. Plan File ({plan-name}-plan.md)** - Full feature specifications

- Complete Gherkin scenarios (all paths)
- Detailed TDD cycles with test code
- Component design rationale
- Full gotcha descriptions
- This is the source material

**2. interfaces.md** - Contract source of truth

- Full TypeScript signatures
- Usage examples
- Constraints and invariants
- Cross-reference which features use what

**3. README.md** - Index

- Mermaid dependency graph
- Status matrix (all features)
- Agent assignments
- File links

**4. gotchas.md** - Empty, ready for discoveries

- Template with format
  - Created using `create_doc` (server: `limps`) with appropriate template

### Phase 3: Assign Features to Agents

Group features by:

- File ownership (minimize conflicts)
- Dependency chains (dependent features same agent when possible)
- Parallelism (maximize independent work)

Each agent should have:

- 2-4 features (adjust based on complexity)
- Clear file ownership
- Minimal cross-agent dependencies

### Phase 4: Agent Files

**Critical step**: Distill, don't copy. Agent files are minimal execution context.

Target size is ~200-400 lines for 2-4 features. If the interface itself is the
deliverable, include full definitions inline and allow ~400-600 lines.

**Use MCP tools for agent file creation:**

- Create agent files using `create_doc` (server: `limps`)
- Path format: `plans/NNNN-descriptive-name/agents/NNN_agent_descriptive-name.agent.md`
- Use template `none` (agent files are code, not documentation)

For each agent, create `agents/<NNN>_agent_<descriptive-name>.agent.md` where NNN is sequential starting from 000 (zero-padded to 3 digits):

**Agent File Naming Pattern**:

- Format: `<NNN>_agent_<descriptive-name>.agent.md` (zero-padded to 3 digits)
- NNN starts at 000 and increments sequentially based on dependency order
- Examples:
  - `000_agent_infrastructure.agent.md` (no dependencies, runs first)
  - `001_agent_testing_utilities.agent.md` (depends on infrastructure)
  - `002_agent_ui_components.agent.md` (depends on testing utilities)
  - `010_agent_selection_sorting.agent.md` (10th agent)


### Phase 5: Validate

- [ ] Agent files are self-contained (no required searching)
- [ ] Interface contracts match between agents
- [ ] Dependency graph is accurate
- [ ] File ownership has no conflicts
- [ ] Each agent file < 500 lines

## Output Structure

```text
NNNN-descriptive-name/
├── README.md              # Index, graph, status
├── {plan-name}-plan.md                # Full specs (verbose, ~1000+ lines OK)
├── interfaces.md          # Contracts (~200-500 lines)
├── gotchas.md             # Empty template
└── agents/
    ├── 000_agent_infrastructure.agent.md      # ~200-400 lines
    ├── 001_agent_testing_utilities.agent.md  # ~200-400 lines
    └── 002_agent_ui_components.agent.md      # ~200-400 lines
```

## Agent File Format

**File naming**: `<NNN>_agent_<descriptive-name>.agent.md` (e.g., `000_agent_infrastructure.agent.md`) - Zero-padded to 3 digits for proper lexicographical ordering

**File header**: The agent header in the file should still be descriptive:

````markdown
---
title: [Descriptive Name]
status: GAP
persona: coder
depends_on: [000, 001]   # zero-padded agent numbers this agent depends on; [] if none
files: [src/path/to/file.ts]
tags: [feature-area]
---

# Agent <N>: [Descriptive Name]

**Plan Location**: `plans/[plan-name]/[plan-name]-plan.md`

## Scope

Features: #X, #Y, #Z
Own: `src/[path]/*`
Depend on: Agent [N] for #A, #B
Block: Agent [M] waiting on #Y

## Interfaces

### Export

```typescript
// #X
export fn(): Type;
// #Y
export Component: FC<Props>;
```
````

### Receive

```typescript
// #A (Agent N) ✅ READY
// shape: { ... }
```

## Features

### #X: [Name]

TL;DR: [One sentence]
Status: `GAP`
Test IDs: `x-element-id`
Files: `path/file.ts` (create)

TDD:

1. `test name` → impl → refactor
2. `test name` → impl → refactor

Gotchas:

- [brief issue]: [brief workaround]

---

### #Y: [Name]

[Same minimal structure]

---

## Done

- [ ] TDD cycles pass
- [ ] Exports match interface
- [ ] Test IDs implemented
- [ ] Status → PASS

## Distillation Rules

| Plan file (verbose)        | agent.md (distilled)     |
| ------------------------ | ------------------------ |
| Full Gherkin scenario    | One-line TL;DR           |
| Detailed TDD with code   | `test → impl → refactor` |
| Component design table   | Just file paths          |
| Gotcha with full context | `issue: workaround`      |
| Interface with examples  | Just signatures          |

Agent files must be self-contained for execution. Scoped references are allowed
when necessary (explicit file + heading), but broad searching means the distillation
is too thin.

## Work Type Adjustments

### Refactor

- Emphasize: behavior preservation tests
- Agent files include: migration paths
- Extra in plan file: before/after comparisons

### Overhaul

- Emphasize: rollback checkpoints
- Agent files include: rollback commit hashes
- Extra in plan file: breaking changes, migration guide

### Feature Development

- Emphasize: integration points
- Agent files include: dependency status clearly marked
- Extra in plan file: user stories, acceptance criteria

## Validation Checklist

Before presenting plan:

- [ ] Each agent file < 500 lines
- [ ] No duplicate info across agent files
- [ ] Interfaces match (export = receive)
- [ ] Dependency graph complete
- [ ] All features assigned
- [ ] File ownership clear (no conflicts)
- [ ] Agent files use numeric prefixes (0*agent*, 1*agent*, etc.) - Number first for lexicographical ordering
- [ ] gotchas.md template ready

## Usage After Creation

**Assign work**:

```text
Copy: agents/columns.agent.md
Paste to Claude agent
Agent implements
```

**Optional: Assess initial status**:
After creating a plan, you can use `get_next_task` MCP tool to see the first recommended task. This is optional but can help verify the plan structure is correct.

**Optional: Reindex knowledge graph**:
After creating a plan, use `reindex_docs` MCP tool to update the knowledge graph index with the new plan documents.

**Update plan**:

```text
/update-feature-plan [path]
```

Use this when interfaces or feature scope changes; regenerate affected agents.

**Check status**:
Review README.md status matrix

## MCP Tool Usage Examples

### Creating a Plan

```typescript
// 1. List existing plans to find next number
const plans = await call_mcp_tool({
  server: 'limps',
  toolName: 'list_docs',
  arguments: { path: 'plans' },
});

// 2. Create plan structure
await call_mcp_tool({
  server: 'limps',
  toolName: 'create_plan',
  arguments: {
    name: 'feature-name', // no numeric prefix; create_plan adds it
    description: 'Brief overview of the plan',
  },
});

// 3. Create plan file
await call_mcp_tool({
  server: 'limps',
  toolName: 'create_doc',
  arguments: {
    path: 'plans/0008-feature-name/0008-feature-name-plan.md', // use the prefixed dir name
    content: '...', // Full verbose specs
    template: 'none',
  },
});

// 4. Create interfaces.md
await call_mcp_tool({
  server: 'limps',
  toolName: 'create_doc',
  arguments: {
    path: 'plans/0008-feature-name/interfaces.md',
    content: '...', // Contract definitions
    template: 'none',
  },
});

// 5. Create README.md
await call_mcp_tool({
  server: 'limps',
  toolName: 'create_doc',
  arguments: {
    path: 'plans/0008-feature-name/README.md',
    content: '...', // Index with dependency graph
    template: 'none',
  },
});

// 6. Create gotchas.md
await call_mcp_tool({
  server: 'limps',
  toolName: 'create_doc',
  arguments: {
    path: 'plans/0008-feature-name/gotchas.md',
    content: '...', // Empty template
    template: 'addendum', // or 'none' if addendum template not available
  },
});

// 7. Create agent files
await call_mcp_tool({
  server: 'limps',
  toolName: 'create_doc',
  arguments: {
    path: 'plans/0008-feature-name/agents/000_agent_infrastructure.agent.md',
    content: '...', // Distilled agent context
    template: 'none',
  },
});
```

### Reading and Processing Documents

```typescript
// Read full document content
const existingPlan = await call_mcp_tool({
  server: 'limps',
  toolName: 'process_doc',
  arguments: {
    path: 'plans/0005-feature-name/0005-feature-name-plan.md',
    code: 'doc.content',
  },
});

// Extract specific sections
const interfaces = await call_mcp_tool({
  server: 'limps',
  toolName: 'process_doc',
  arguments: {
    path: 'plans/0005-feature-name/interfaces.md',
    code: 'doc.content.split("\\n").slice(0, 50).join("\\n")', // First 50 lines
  },
});

// Extract all GAP features from a plan
const gapFeatures = await call_mcp_tool({
  server: 'limps',
  toolName: 'process_doc',
  arguments: {
    path: 'plans/0008-feature-name/0008-feature-name-plan.md',
    code: `
      const features = extractFeatures(doc.content);
      return features.filter(f => f.status === 'GAP');
    `,
  },
});

// Analyze feature distribution across all plans
const planSummary = await call_mcp_tool({
  server: 'limps',
  toolName: 'process_docs',
  arguments: {
    pattern: 'plans/*/*-plan.md',
    code: `
      return docs.map(doc => {
        const features = extractFeatures(doc.content);
        return {
          plan: extractFrontmatter(doc.content).meta.name,
          total: features.length,
          gap: features.filter(f => f.status === 'GAP').length,
          wip: features.filter(f => f.status === 'WIP').length,
          pass: features.filter(f => f.status === 'PASS').length
        };
      });
    `,
  },
});
```

## Notes

- **MCP tools handle file operations** - No need to manually create directories or files
- **Templates available** - Use `addendum`, `research`, `example`, or `none` templates when creating docs
- **Path format** - Always use relative paths from configured docsPath: `plans/NNNN-name/filename.md`
- **Use process_doc/process_docs** - For reading and querying documents, use `process_doc` and `process_docs` instead of `read_doc` or `rlm_query`
- **Full reads** - Use `process_doc({ path, code: 'doc.content' })` for full document reads
