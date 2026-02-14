> **SUPERSEDED** by [0050-obsidian-deep-integration](../0050-obsidian-deep-integration/0050-obsidian-deep-integration-plan.md)

---
title: limps Obsidian Plugin — Primary Human UI
status: draft
workType: feature
tags: [limps/plan, limps/worktype/feature, limps/priority/high, obsidian, human-ui, cli-wrapper]
created: 2026-01-26
updated: 2026-01-31
---

# limps Obsidian Plugin — Primary Human UI

## Related docs

- [[0028-limps-obsidian-plugin-requirements|Requirements (Userdoc-style)]]

## Philosophy: CLI-First, Obsidian Wraps

```
limps CLI (source of truth)
    ↑
    │ wraps via exec()
    ↓
Obsidian Plugin (human UI)
    │
    ├── Plan Dashboard (from `limps list_plans`)
    ├── Health Sidebar (from `limps graph health`)
    ├── Graph View (enhanced with entity relationships)
    └── Command Palette (calls `limps` commands)
```

**The plugin does NOT run an MCP server.** It calls CLI commands directly via `child_process.exec()`. This is simpler, faster, and keeps all intelligence in the CLI.

---

## Why Obsidian (Not Just Files)

File compatibility gets you:
- ✅ Readable in Obsidian
- ✅ Graph view works
- ✅ Basic search

A plugin gets you:
- 🚀 **Proactive Conflict Alerts** — Toast notifications when `limps graph health` finds issues
- 🚀 **Knowledge Graph Integration** — Plan 0042's entity graph in Obsidian's graph view
- 🚀 **Command Palette** — `Ctrl+P` → "Create Agent", "Mark Task PASS", "Search Graph"
- 🚀 **Health Sidebar** — Always-visible conflict status
- 🚀 **Custom Views** — Plan dashboard, agent status board
- 🚀 **Graph Enhancements** — Color by status, filter by plan

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Obsidian                          │
│  ┌─────────────────────────────────────────────┐    │
│  │           limps-obsidian-plugin              │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────────┐    │    │
│  │  │Commands │ │ Views   │ │Health Panel │    │    │
│  │  └────┬────┘ └────┬────┘ └──────┬──────┘    │    │
│  │       │           │             │           │    │
│  │       └───────────┼─────────────┘           │    │
│  │                   │                          │    │
│  │           ┌───────▼───────┐                 │    │
│  │           │  CLI Wrapper  │                 │    │
│  │           │ exec('limps') │                 │    │
│  │           └───────┬───────┘                 │    │
│  └───────────────────┼─────────────────────────┘    │
└──────────────────────┼──────────────────────────────┘
                       │ child_process.exec()
              ┌────────▼────────┐
              │   limps CLI     │
              │  (all commands) │
              └─────────────────┘
```

### Why CLI (Not MCP)

| Approach | Pros | Cons |
|----------|------|------|
| MCP Server | Protocol standard | Extra process, complexity |
| Direct CLI | Simple, fast, no daemon | Spawns process per command |

**Decision:** Direct CLI. Commands are fast (<100ms), and we avoid daemon management. If performance becomes an issue, add a simple JSON-RPC server later.

---

## Integration with Plan 0042 (Knowledge Graph)

The plugin surfaces Plan 0042's knowledge graph features:

| CLI Command | Plugin Feature |
|-------------|----------------|
| `limps graph health` | Health sidebar with conflict alerts |
| `limps graph search` | Command: "limps: Search Graph" |
| `limps graph trace` | Command: "limps: Trace Dependencies" |
| `limps graph overlap` | Warning modal on feature creation |
| `limps graph watch` | Background process, toast on conflicts |

### Health Sidebar

```typescript
class HealthSidebarView extends ItemView {
  async onOpen() {
    const health = await this.plugin.exec('limps graph health --json');
    this.renderHealth(health);
  }
  
  renderHealth(health: HealthResult) {
    // Show conflicts with severity icons
    // 🚨 Critical, ⚠️ Warning, ℹ️ Info
    // Click to navigate to affected plan/agent
  }
}
```

### Proactive Notifications

On vault open, start watching:

```typescript
class LimpsPlugin extends Plugin {
  async onload() {
    // Start background watcher
    this.watcher = spawn('limps', ['graph', 'watch', '--on-conflict', 'json']);
    
    this.watcher.stdout.on('data', (data) => {
      const conflicts = JSON.parse(data);
      for (const c of conflicts) {
        new Notice(`${c.severity}: ${c.message}`, 5000);
      }
      this.healthView?.refresh();
    });
  }
}
```

---

## Features

### Phase 1: Core Integration (MVP)

#### F1.1: CLI Wrapper

```typescript
class LimpsPlugin extends Plugin {
  async exec(command: string): Promise<any> {
    const { stdout } = await execAsync(`limps ${command}`, {
      cwd: this.app.vault.adapter.basePath,
    });
    return JSON.parse(stdout);
  }
}
```

#### F1.2: Health Sidebar View
- Shows `limps graph health` output
- Auto-refreshes on file changes
- Click conflict to navigate to file
- Severity icons (🚨⚠️ℹ️)

#### F1.3: Command Palette Integration
- `limps: Create New Plan` → `limps create_plan`
- `limps: Create Agent` → `limps create_agent` (in current plan)
- `limps: Mark PASS` → `limps update_task_status --status PASS`
- `limps: Get Next Task` → `limps get_next_task`
- `limps: Search Graph` → modal with `limps graph search`
- `limps: Trace Dependencies` → modal with `limps graph trace`
- `limps: Reindex` → `limps graph reindex`
- `limps: Check Overlap` → `limps graph overlap`

#### F1.4: Toast Notifications
- On conflict detected (from watch mode)
- On successful status change
- On reindex complete

### Phase 2: Views & Dashboards

#### F2.1: Plan Dashboard View
- All plans from `limps list_plans --json`
- Status counts (GAP/WIP/PASS/BLOCKED)
- Click to open plan file
- Quick-filter by status

#### F2.2: Agent Status Board
- Kanban-style view
- Drag-drop to change status (calls `limps update_task_status`)
- Shows dependencies as links
- Color-coded by persona

#### F2.3: Dependency Graph Modal
- Shows `limps graph trace` output
- Interactive graph visualization
- Click node to navigate to file

### Phase 3: Graph Enhancements

#### F3.1: Graph Coloring
- Color nodes by status (green=PASS, yellow=WIP, red=BLOCKED, gray=GAP)
- Uses Obsidian's graph CSS customization
- Toggle via settings

#### F3.2: Graph Filtering
- Filter to show only current plan
- Filter by status
- Show/hide based on entity type

#### F3.3: Entity Relationships
- Inject Plan 0042's relationships into graph
- Show DEPENDS_ON, MODIFIES, SIMILAR_TO edges
- Requires hooking into graph rendering

### Phase 4: Smart Features

#### F4.1: Overlap Warning on Create
When creating new plan/feature:
```typescript
async createPlan(name: string) {
  const overlap = await this.exec(`graph overlap --threshold 0.7 --json`);
  if (overlap.similar.length > 0) {
    new OverlapWarningModal(this.app, overlap).open();
    // "Similar features exist. Continue anyway?"
  }
}
```

#### F4.2: Auto-Reindex on Save
- Hook into `vault.on('modify')`
- Call `limps graph reindex --incremental` on plan/agent files
- Debounce to avoid spam

#### F4.3: Frontmatter Validation
- Validate on save
- Show warnings for invalid status, missing depends, etc.
- Quick-fix suggestions

---

## Settings

```typescript
interface LimpsSettings {
  // CLI
  limpsPath: string;              // Path to limps binary (default: 'limps')
  plansPath: string;              // Path to plans directory (default: 'plans')
  
  // Health
  showHealthSidebar: boolean;     // Show health sidebar on startup
  watchMode: boolean;             // Run background watcher
  notifyOnConflict: boolean;      // Toast on conflicts
  
  // Graph
  graphColoring: 'status' | 'persona' | 'none';
  showEntityRelationships: boolean;
  
  // Behavior
  autoReindex: boolean;           // Reindex on file save
  validateFrontmatter: boolean;
  warnOnOverlap: boolean;         // Warn when creating similar features
}
```

---

## File Structure

```
limps-obsidian-plugin/
├── src/
│   ├── main.ts              # Plugin entry point
│   ├── settings.ts          # Plugin settings
│   ├── cli/
│   │   ├── wrapper.ts       # exec() wrapper
│   │   └── types.ts         # CLI output types
│   ├── views/
│   │   ├── HealthSidebar.ts
│   │   ├── PlanDashboard.ts
│   │   ├── AgentBoard.ts
│   │   └── DependencyGraph.ts
│   ├── modals/
│   │   ├── SearchModal.ts
│   │   ├── TraceModal.ts
│   │   └── OverlapWarning.ts
│   ├── commands/
│   │   ├── index.ts
│   │   └── ... (one per command)
│   ├── graph/
│   │   └── enhancer.ts      # Graph view modifications
│   └── watcher.ts           # Background conflict watcher
├── styles.css
├── manifest.json
├── package.json
└── esbuild.config.mjs
```

---

## Dependencies on Other Plans

| Plan | Dependency |
|------|------------|
| **0042 Knowledge Graph** | All `graph` commands (health, search, trace, overlap) |
| **0041 Semantic Search** | Consumed by 0042's hybrid retrieval |
| **Existing limps** | list_plans, create_plan, update_task_status, etc. |

**Critical:** Plan 0042 should be complete before Phase 2+ features.

---

## Success Criteria

- [ ] Can create/manage plans without leaving Obsidian
- [ ] Health sidebar shows conflicts in <1s
- [ ] Toast notifications on conflict detection
- [ ] Graph view shows status colors
- [ ] All commands work via palette
- [ ] <100ms command execution (CLI call)
- [ ] Zero config for basic usage (auto-detect limps in PATH)
- [ ] Works fully offline

---

## Agent Breakdown

| Agent | Title | Depends | Deliverable |
|-------|-------|---------|-------------|
| 000 | CLI Wrapper | — | `exec()` helper, types |
| 001 | Health Sidebar | 000, Plan 0042 | Sidebar view with conflicts |
| 002 | Command Palette | 000 | All palette commands |
| 003 | Plan Dashboard | 000 | Dashboard view |
| 004 | Agent Board | 000 | Kanban view with drag-drop |
| 005 | Graph Enhancements | 000 | Status coloring, filtering |
| 006 | Background Watcher | 000, Plan 0042 | Watch mode + notifications |
| 007 | Smart Features | 001, 002, Plan 0042 | Overlap warning, auto-reindex |

---

## References

- [Obsidian Plugin API](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- Plan 0042: Knowledge Graph Foundation
- Plan 0041: Semantic Search
