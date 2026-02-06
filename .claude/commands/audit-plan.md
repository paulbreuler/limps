# Audit Plan v1.0.0

Run a product-manager-style audit of a feature plan: scorecard by category, findings by severity, duplicate-feature detection across plans, and concrete next edits. Use after creating or updating a plan and before running agents; output is intended to feed back into the plan for iterative improvement.

## Invocation

```text
/audit-plan [plan-name-or-path]
/audit-plan --plan <plan-name>
/audit-plan --no-duplicates   # Skip cross-plan duplicate scan
```

## MCP Integration

This command uses limps MCP tools for plan analysis:

- **Server**: `limps`
- **Tools**:
  - `list_plans` - List available plans (when no plan specified or plan not found)
  - `list_agents` - List agents for a plan (plan name required)
  - `get_plan_status` - Plan progress summary
  - `process_doc` - Read and analyze a single document (plan file, interfaces.md, README.md, agents, gotchas.md)
  - `process_docs` - Analyze multiple documents (e.g. all plan files for duplicate scan)
  - `search_docs` - Full-text search (optional, for keyword collisions in duplicate scan)

**Usage**: Call tools via `call_mcp_tool` with `server: "limps"` and the tool name. Paths are relative to configured docsPath (e.g. `plans/NNNN-name/{plan-name}-plan.md`).

## When to Use

- **After** `/create-feature-plan` or `/update-feature-plan` to validate plan quality before execution
- **Before** `/run-agent` or assigning work to agents
- When you want to check for overlapping features or plan intent across existing plans
- When improving plans iteratively (audit output feeds into document edits)

## Instructions for Claude

**When this command is invoked, you must:**

### 1. Identify the Plan

**Use `/limps-plan-operations identify-plan` skill** for consistent plan identification:

- If user provides a plan name or path (e.g. `0041-limps-improvements` or `plans/0041-limps-improvements`), use it.
- If no plan provided: call `list_plans` (server: `limps`), then choose the most recently modified or highest-numbered plan as default, or ask the user which plan to audit.
- Resolve to a plan directory name `NNNN-descriptive-name` and base path `plans/NNNN-descriptive-name/`.

### 2. Load Plan Artifacts

**Use `/limps-plan-operations load-artifacts` skill** for consistent artifact loading:

Using only `process_doc` and `process_docs` (server: `limps`), read:

- `plans/{plan-name}/{plan-name}-plan.md` - Full specs
- `plans/{plan-name}/interfaces.md` - Contracts
- `plans/{plan-name}/README.md` - Index, graph, status matrix
- `plans/{plan-name}/gotchas.md` - If present
- All agent files: use `process_docs` (server: `limps`) with pattern `plans/{plan-name}/agents/*.agent.md` to read all agent files in one call.

If a file is missing, note it in the audit and continue (e.g. no gotchas.md is acceptable).

### 3. Run Scorecard (0-5 per Category)

Score each category 0 (missing or poor) to 5 (excellent). Provide one or two sentence justification and specific references (section titles, feature IDs, file names). Be specific and actionable; avoid vague praise or criticism.

**Categories:**

| Category | What to evaluate |
| -------- | ---------------- |
| **Problem & Scope** | Clear goal, non-goals, user value, constraints, assumptions, explicit scope boundaries. |
| **Scenarios & Acceptance Criteria** | Gherkin/acceptance criteria: happy path, edge cases, error/negative cases; testability; explicit success conditions. |
| **Local-First Experience** | Offline-first behavior, instant local responsiveness, data ownership/privacy, sync/conflict behavior, graceful degradation without network. Explicitly evaluate impact on **Cursor**, **Claude**, and **CLI** local-only workflows. |
| **CLI & Extensibility** | Structure for adding new content: command patterns, flags, output format consistency, discoverability, minimal coupling, backward-compatible evolution. |
| **Dependencies & Risks** | External dependencies, sequence constraints, risk mitigation, rollback paths. |
| **Plan Consistency** | Alignment between plan file, interfaces.md, README.md, and agent files; no mismatch between interfaces and agent exports/receives; dependency graph matches assignments. |
| **Duplicate Detection** | Only if not disabled with `--no-duplicates`: see step 4. Score 0-5 based on whether the plan clearly differs from others (5 = no overlap, 0 = high overlap or redundant intent). |

### 4. Duplicate Scan (unless `--no-duplicates`)

- Call `process_docs` (server: `limps`) with pattern `plans/*/*-plan.md` and code that extracts from each document: plan name, feature IDs, and normalized feature titles (or one-line summaries).
- Compare the audited plan's features to others: normalize titles (lowercase, strip punctuation), compare token overlap or key phrases. Optionally use `search_docs` for shared keywords.
- Report likely duplicates as a list: `Plan A` feature `#X: Title` vs `Plan B` feature `#Y: Title` with a confidence level (High / Medium / Low). If none, say "No likely duplicates found."

### 5. Health Checks (Automated)

Run these MCP tools to supplement manual audit:

- **`check_staleness`** (server: `limps`): Identify agents or plans that haven't been updated recently. Include staleness warnings in findings.
- **`check_drift`** (server: `limps`): Verify file references in agent frontmatter match actual files on disk. Report any missing or renamed files.
- **`infer_status`** (server: `limps`): Check if any agent statuses should change based on dependency completion. Report suggestions.

Include health check results in the scorecard and findings sections.

### 6. Emit Findings by Severity

- **Critical**: Blocking issues (e.g. missing scope, broken interface consistency, no acceptance criteria).
- **Major**: Important gaps (e.g. missing edge cases, unclear local-first behavior, dependency risks).
- **Minor**: Improvements (e.g. wording, extra scenarios, documentation clarity).

For each finding: severity, category, one-line summary, and pointer to exact location (file + section or feature ID).

### 7. Output Format

Produce the following in order:

**Scorecard (table):** Output a table like:

| Category | Score (0-5) | Notes |
| -------- | ----------- | ----- |
| Problem & Scope | X | ... |
| Scenarios & Acceptance Criteria | X | ... |
| Local-First Experience | X | ... |
| CLI & Extensibility | X | ... |
| Dependencies & Risks | X | ... |
| Plan Consistency | X | ... |
| Duplicate Detection | X | ... (or "Skipped") |

**Findings** (Critical / Major / Minor)

- Critical: ...
- Major: ...
- Minor: ...

**Duplicate scan** (if run): list of likely duplicates with plan/feature refs and confidence, or "No likely duplicates found."

**Next edits**: bulleted list of concrete edits (file path, section or feature ID, suggested change). One line per edit; directly actionable for the user or a follow-up agent.

### 8. Error Handling

- If no plan is provided and no default can be chosen: list plans via `list_plans` and ask the user to specify.
- If the plan directory or main plan file does not exist: report clearly and list available plans.
- If limps MCP tools are unavailable: ask the user for the plan path and work from file content only (read from workspace); note in output that duplicate scan and full consistency checks may be limited.

## Example Output (Snippet)

```text
## Scorecard

| Category                         | Score (0-5) | Notes |
| -------------------------------- | ----------- | ----- |
| Problem & Scope                 | 4           | Goal and non-goals clear; constraints could list max supported plans. |
| Scenarios & Acceptance Criteria | 3           | Happy paths covered; add error cases for missing config. |
| Local-First Experience          | 5           | Plan explicitly keeps Cursor/Claude/CLI local-only. |
| CLI & Extensibility             | 4           | New commands documented; flag conventions consistent. |
| Dependencies & Risks            | 3           | Rollback mentioned; external deps not listed. |
| Plan Consistency                | 5           | interfaces.md and agent exports/receives match. |
| Duplicate Detection             | 5           | No overlap with 0040-other-plan. |

## Findings

- **Major**: Plan file Feature #2 - add "When config is missing" scenario (Scenarios & Acceptance Criteria).
- **Minor**: README.md - status matrix missing agent 002 (Plan Consistency).

## Duplicate scan

No likely duplicates found.

## Next edits

- plans/0041-limps-improvements/0041-limps-improvements-plan.md: Feature #2 - Add scenario "When config is missing, then ...".
- plans/0041-limps-improvements/README.md: Status matrix - add row for agent 002.
```

## Integration with Other Commands

| Command | Purpose |
| ------- | ------- |
| `create-feature-plan` | Create new plan; run audit after to validate. |
| `update-feature-plan` | Update plan and agents; run audit to re-check quality. |
| **audit-plan** | PM-style audit and next-edits; feed results into plan edits. |
| `run-agent` | Start agent work; run after audit when satisfied. |
| `list-feature-plans` | Discover plan names if unsure which to audit. |

## Notes

- Use only `process_doc` and `process_docs` (and optionally `search_docs`) for reading plan content; do not assume a different read API.
- Path format: always relative to configured docsPath, e.g. `plans/0041-limps-improvements/0041-limps-improvements-plan.md`.
- Keep output concise and actionable so it can be used to iteratively improve documents and avoid duplicating features or plans.
- Scoring is subjective; consistency and actionable notes matter more than the raw number.
