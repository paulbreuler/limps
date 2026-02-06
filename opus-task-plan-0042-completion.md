# Opus 4.6 Task: Complete Plan 0042 Knowledge Graph Foundation

## Context

Plan 0042 implements a Knowledge Graph Foundation for the limps planning system. The core infrastructure (agents 000-003) is complete and all tests pass. We need to finish the user-facing layer (agents 004-007).

**Branch:** feat/0042-agent-001-entity-resolution
**Base:** All core graph/extraction/resolution/retrieval code is in `packages/limps/src/`

## Completed Work ✅

- **000**: Entity Schema & Storage (`types.ts`, `schema.ts`, `storage.ts`)
- **001**: Entity Extraction (`extractor.ts`, `patterns.ts`, `parser.ts`)
- **002**: Entity Resolution (`resolver.ts`, `similarity.ts`)
- **003**: Hybrid Retrieval (`hybrid.ts`, `router.ts`, `rrf.ts`, `bfs.ts`, `recipes.ts`)

All have tests passing. Build/lint clean.

## Remaining Work

### Agent 004: Proactive Watch Mode (HIGHEST PRIORITY - Start First)
**Status:** GAP
**Files to create:**
- `packages/limps/src/watch/index.ts` - GraphWatcher class with chokidar
- `packages/limps/src/watch/detector.ts` - ConflictDetector class
- `packages/limps/src/watch/notifier.ts` - Notifier class

**Key Requirements:**
- Use existing `chokidar` dependency for file watching
- Watch `*.md` files in plans directory (filter for `-plan.md` and `.agent.md`)
- On file change: re-index plan → detect conflicts → notify
- Conflict types to detect:
  - `file_contention`: Two agents modifying same file (check MODIFIES relationships)
  - `feature_overlap`: SIMILAR_TO relationships with confidence >= 0.85
  - `circular_dependency`: DFS cycle detection in DEPENDS_ON graph
  - `stale_wip`: WIP agents with no update in 7+ days (warning) or 14+ days (critical)
- Notification targets: 'log' (console), 'file' (write to path), 'notify' (desktop), 'webhook' (HTTP POST)
- Use existing GraphStorage, EntityExtractor from `src/graph/`

**Acceptance:**
- Watch mode starts/stops cleanly
- File changes trigger incremental reindex
- All 4 conflict types detected correctly
- Notifications work for all targets

---

### Agent 005: CLI Interface (BLOCKED until 004 complete)
**Status:** GAP  
**Depends on:** 004
**Files to create:**
- `packages/limps/src/cli/commands/graph/index.ts` - Command group setup
- `packages/limps/src/cli/commands/graph/health.ts` - Health check command
- `packages/limps/src/cli/commands/graph/search.ts` - Search command
- `packages/limps/src/cli/commands/graph/trace.ts` - Dependency trace command
- `packages/limps/src/cli/commands/graph/watch.ts` - Watch mode command
- `packages/limps/src/cli/commands/graph/reindex.ts` - Reindex command
- `packages/limps/src/cli/commands/graph/entity.ts` - Entity inspection command
- `packages/limps/src/cli/commands/graph/overlap.ts` - Feature overlap command

**Key Requirements:**
- Use Commander.js (already in project)
- All commands support `--json` flag for machine-readable output
- JSON structure: `{ success: boolean, data?: any, error?: string, meta?: { timestamp, duration_ms } }`
- Exit codes: 0 = success, 1 = error, 2 = conflicts found (for CI)
- Integrate with existing CLI structure (see `src/cli/commands/`)
- Commands:
  - `limps graph reindex [--plan <id>] [--incremental]`
  - `limps graph health [--json]`
  - `limps graph check <type>` (contention|overlap|dependencies|stale)
  - `limps graph watch [--on-conflict <target>] [--url <webhook>]`
  - `limps graph search <query> [--top <k>] [--json]`
  - `limps graph trace <entity> [--direction up|down|both] [--depth <n>] [--json]`
  - `limps graph entity <canonical-id> [--json]`
  - `limps graph overlap [--plan <id>] [--threshold <n>] [--json]`
  - `limps graph suggest <type>` (consolidate|next-task)

**Acceptance:**
- All commands work standalone
- `--json` produces valid JSON output
- Help text for all commands
- <100ms startup time

---

### Agent 006: MCP Wrappers (BLOCKED until 005 complete)
**Status:** GAP
**Depends on:** 005
**Files to create:**
- `packages/limps/src/mcp/tools/graph.ts` - MCP tool definitions

**Key Requirements:**
- **CRITICAL**: NO business logic in MCP tools - they are thin wrappers
- Each tool: `exec('limps graph <command> --json')` → `JSON.parse(stdout)` → return
- Use existing MCP tool registration pattern (see `src/tools/`)
- Tools to wrap:
  - `graph_health` → `limps graph health --json`
  - `graph_search` → `limps graph search "<query>" --top <k> --json`
  - `graph_trace` → `limps graph trace "<entity>" --direction <dir> --depth <n> --json`
  - `graph_entity` → `limps graph entity "<id>" --json`
  - `graph_overlap` → `limps graph overlap --threshold <n> --json`
  - `graph_reindex` → `limps graph reindex [--plan <id>] [--incremental] --json`
  - `graph_check` → `limps graph check <type> --json`
  - `graph_suggest` → `limps graph suggest <type> --json`

**Acceptance:**
- All wrappers <10 lines each (exec + parse)
- Error handling: timeout (30s), CLI not found, parse errors
- Works with existing MCP server initialization

---

### Agent 007: Documentation (BLOCKED until all others complete)
**Status:** GAP
**Depends on:** All previous agents
**Files to create:**
- `docs/knowledge-graph.md` - Architecture overview
- `docs/cli-reference.md` - CLI command reference
- Update `README.md` with graph commands section

**Key Requirements:**
- Explain "System-Intelligent, Not AI-Intelligent" philosophy
- Document entity types and relationships
- Document conflict types and severity levels
- CLI reference with examples for all commands
- Integration guide mentioning Plan 0028 (Obsidian) and Plan 0041 (Semantic Search)
- JSON output format specification

**Acceptance:**
- All docs complete and accurate
- Examples work when copy-pasted
- README updated

---

## Parallelization Strategy

1. **Start Agent 004 immediately** (no blockers)
2. **Agent 005** can start once 004's detector interface is stable (can stub if needed)
3. **Agent 006** needs 005 CLI commands to exist (can stub with `echo '{"success":true}'`)
4. **Agent 007** waits until all implementation is done

## Dependencies to Install (if missing)

Check if these are already in package.json:
- `chokidar` (for file watching)
- `commander` (for CLI - likely already present)
- `node-notifier` (optional, for desktop notifications in 004)

## Testing Requirements

- Write tests for 004's conflict detection logic
- CLI commands can be tested via integration tests (exec command, check output)
- Minimum 70% coverage (existing threshold)

## Commands to Run After Changes

```bash
npm run build
npm run lint
npm test
```

## Reference Files

- Plan spec: `plans/0042-Knowledge Graph Foundation/0042-Knowledge Graph Foundation-plan.md`
- Agent specs: `plans/0042-Knowledge Graph Foundation/agents/00{4,5,6,7}-*.agent.md`
- Existing graph code: `packages/limps/src/graph/`
- Existing retrieval code: `packages/limps/src/retrieval/`
- Existing CLI pattern: `packages/limps/src/cli/commands/`
- Existing MCP tools: `packages/limps/src/tools/`

## Success Criteria

- [ ] Agent 004: Watch mode detects all conflict types
- [ ] Agent 005: All graph CLI commands work with --json
- [ ] Agent 006: MCP tools wrap CLI commands (no logic)
- [ ] Agent 007: Documentation complete
- [ ] All tests pass
- [ ] Build and lint clean
- [ ] Plan 0042 status updated to reflect completion

Start with Agent 004 immediately. Report progress on each agent as you complete them.
