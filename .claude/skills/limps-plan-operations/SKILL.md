---
name: limps-plan-operations
description: Common operations for working with limps feature plans: identifying plans, loading plan artifacts, and using limps MCP tools. Use when commands need to work with plan files, interfaces, README, gotchas, or agent files.
argument-hint: "[identify-plan | load-artifacts | resolve-path]"
allowed-tools: MCP(limps:list_plans,limps:list_agents,limps:process_doc,limps:process_docs), Read, Grep
---
# Limps Plan Operations

## Purpose

Provide reusable patterns for working with limps feature plans across commands. Handles plan identification, path resolution, and loading plan artifacts (plan files, interfaces.md, README.md, gotchas.md, agent files) using limps MCP tools.

## Scope

- **identify-plan**: Resolve a plan name or path to a canonical plan directory name and base path
- **load-artifacts**: Load all plan artifacts (plan file, interfaces.md, README.md, gotchas.md, agent files) using limps MCP tools
- **resolve-path**: Convert plan name/path input to canonical `plans/NNNN-descriptive-name/` format

## MCP Tool Usage

All operations use limps MCP tools with server `"limps"`:

- `list_plans` - List available plans
- `list_agents` - List agents for a plan
- `process_doc` - Read and analyze a single document
- `process_docs` - Read and analyze multiple documents (e.g., all agent files)

**Path format**: Always relative to configured docsPath, e.g. `plans/0041-limps-improvements/0041-limps-improvements-plan.md`

**Tool invocation**: Use `call_mcp_tool` with `server: "limps"` and the tool name.

## Identify Plan

When a command needs to identify which plan to work with:

### Input Handling

1. **User provides plan name or path**:
   - Examples: `plan 41`, `plan 0041`, `0041-limps-improvements`, `plans/0041-limps-improvements`, `0041-limps-improvements/`
   - Accept any of these formats

2. **No plan provided**:
   - Call `list_plans` (server: `limps`) to get available plans
   - Choose default: most recently modified plan, highest-numbered plan, or ask user
   - Present options if ambiguous

3. **Plan not found**:
   - Report clearly: "Plan '{name}' not found"
   - List available plans via `list_plans`
   - Ask user to specify

### Path Resolution

Resolve input to canonical format:

- **Input**: `0041-limps-improvements` or `plans/0041-limps-improvements` or `0041-limps-improvements/`
- **Output**: Plan directory name `0041-limps-improvements` and base path `plans/0041-limps-improvements/`

**Rules**:

- Strip `plans/` prefix if present
- Strip trailing `/` if present
- Validate format: `NNNN-descriptive-name` (4 digits, hyphen, descriptive name)
- If invalid format, report error and list available plans

### Example Code Pattern

```typescript
// 1. Get user input or default
const planInput = userProvided || await getDefaultPlan();

// 2. Resolve to canonical format
const planName = resolvePlanName(planInput); // "0041-limps-improvements"
const planPath = `plans/${planName}/`; // "plans/0041-limps-improvements/"

// 3. Validate plan exists
const plans = await call_mcp_tool({
  server: "limps",
  toolName: "list_plans",
  arguments: {}
});

const planExists = plans.some(p => p.name === planName);
if (!planExists) {
  // Report error, list available plans
}
```

## Load Plan Artifacts

When a command needs to read plan files:

### Required Files

1. **Plan file**: `plans/{plan-name}/{plan-name}-plan.md` - Full feature specifications
2. **interfaces.md**: `plans/{plan-name}/interfaces.md` - Contract source of truth
3. **README.md**: `plans/{plan-name}/README.md` - Index, graph, status matrix
4. **gotchas.md**: `plans/{plan-name}/gotchas.md` - Discovered issues (optional, may not exist)
5. **Agent files**: `plans/{plan-name}/agents/*.agent.md` - All agent execution files

### Loading Strategy

**Use only `process_doc` and `process_docs`** (server: `limps`) for reading. Do not assume other read APIs.

**Single files** (plan file, interfaces.md, README.md, gotchas.md):

- Use `process_doc` for each file
- Path: `plans/{plan-name}/{filename}.md`
- Code: `"doc.content"` to read full content, or specific extraction code

**Agent files** (multiple):

- Use `process_docs` with pattern `plans/{plan-name}/agents/*.agent.md`
- This loads all agent files in one call
- Code: `"docs.map(d => ({ path: d.path, content: d.content }))"` or specific extraction

### Error Handling

- **Missing file**: Note in output and continue (e.g., no gotchas.md is acceptable)
- **Missing required file** (plan file, interfaces.md, README.md): Report error and stop
- **MCP tools unavailable**: Fall back to reading from workspace files directly (note limitations)

### Example Code Pattern for Loading Artifacts

```typescript
const planName = "0041-limps-improvements";
const planPath = `plans/${planName}/`;

// Load single files
const planFile = await call_mcp_tool({
  server: "limps",
  toolName: "process_doc",
  arguments: {
    path: `${planPath}${planName}-plan.md`,
    code: "doc.content"
  }
});

const interfaces = await call_mcp_tool({
  server: "limps",
  toolName: "process_doc",
  arguments: {
    path: `${planPath}interfaces.md`,
    code: "doc.content"
  }
});

const readme = await call_mcp_tool({
  server: "limps",
  toolName: "process_doc",
  arguments: {
    path: `${planPath}README.md`,
    code: "doc.content"
  }
});

// Load gotchas (optional)
let gotchas = null;
try {
  gotchas = await call_mcp_tool({
    server: "limps",
    toolName: "process_doc",
    arguments: {
      path: `${planPath}gotchas.md`,
      code: "doc.content"
    }
  });
} catch (e) {
  // gotchas.md doesn't exist, continue
}

// Load all agent files
const agents = await call_mcp_tool({
  server: "limps",
  toolName: "process_docs",
  arguments: {
    pattern: `${planPath}agents/*.agent.md`,
    code: "docs.map(d => ({ path: d.path, content: d.content }))"
  }
});
```

## Resolve Path

Convert various plan input formats to canonical path:

### Input Formats Accepted

- `0041-limps-improvements` (plan name only)
- `plans/0041-limps-improvements` (with plans/ prefix)
- `plans/0041-limps-improvements/` (with trailing slash)
- `0041-limps-improvements/` (plan name with trailing slash)

### Output Format

- **Plan name**: `0041-limps-improvements` (canonical directory name)
- **Base path**: `plans/0041-limps-improvements/` (for constructing file paths)
- **Plan file path**: `plans/0041-limps-improvements/0041-limps-improvements-plan.md`

### Validation

- Must match pattern: `NNNN-descriptive-name` where NNNN is 1-4 digits (zero-padded)
- If invalid, report error and list available plans

## Integration with Commands

Commands that use this skill:

- `/audit-plan` - Identify plan, load artifacts for audit
- `/update-feature-plan` - Identify plan, load artifacts for updates
- `/run-agent` - Identify plan, load agent files
- Other plan-related commands

### Command Integration Pattern

```markdown
### 1. Identify the Plan

- If user provides plan name or path, use it
- If no plan provided: call `list_plans` (server: `limps`), choose default or ask
- Resolve to plan directory name `NNNN-descriptive-name` and base path `plans/NNNN-descriptive-name/`

**Note**: Use `/limps-plan-operations identify-plan` skill for consistent plan identification.

### 2. Load Plan Artifacts

Using only `process_doc` and `process_docs` (server: `limps`), read:
- `plans/{plan-name}/{plan-name}-plan.md`
- `plans/{plan-name}/interfaces.md`
- `plans/{plan-name}/README.md`
- `plans/{plan-name}/gotchas.md` (if present)
- All agent files: `process_docs` with pattern `plans/{plan-name}/agents/*.agent.md`

**Note**: Use `/limps-plan-operations load-artifacts` skill for consistent artifact loading.
```

## Common Patterns

### Getting Default Plan

```typescript
const plans = await call_mcp_tool({
  server: "limps",
  toolName: "list_plans",
  arguments: {}
});

// Choose highest-numbered plan
const defaultPlan = plans
  .sort((a, b) => parseInt(b.number) - parseInt(a.number))[0];
```

### Extracting Features from Plan

```typescript
const features = await call_mcp_tool({
  server: "limps",
  toolName: "process_doc",
  arguments: {
    path: `${planPath}${planName}-plan.md`,
    code: "extractFeatures(doc.content)"
  }
});
```

### Checking Plan Consistency

```typescript
// Load all artifacts
const [planFile, interfaces, readme, agents] = await Promise.all([
  loadPlanFile(planPath, planName),
  loadInterfaces(planPath),
  loadReadme(planPath),
  loadAgents(planPath)
]);

// Compare interfaces with agent exports/receives
// Check dependency graph matches assignments
// Verify feature status consistency
```

## Error Handling Patterns

### Plan Not Found

```text
Plan '0042-nonexistent' not found.

Available plans:
- 0041-limps-improvements
- 0040-other-feature
- 0039-another-plan

Please specify a valid plan name.
```

### MCP Tools Unavailable

If limps MCP tools are unavailable:

- Ask user for plan path
- Read files directly from workspace using Read tool
- Note in output that some operations may be limited (e.g., duplicate scan, full consistency checks)

### Missing Required Files

```text
Error: Required file missing: plans/0041-limps-improvements/0041-limps-improvements-plan.md

Please ensure the plan directory exists and contains the plan file.
```

## Notes

- Always use `process_doc` and `process_docs` for reading plan content; do not assume other read APIs
- Path format: always relative to configured docsPath
- Plan names are case-sensitive and must match directory names exactly
- Agent files use pattern `*_agent_*.agent.md` or `agent_*_*.agent.md` (backward compatibility)
- Zero-padded plan numbers (0001, 0002, ...) ensure proper lexicographical ordering
