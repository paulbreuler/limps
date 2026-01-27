---
title: limps Obsidian Plugin
status: draft
workType: feature
tags: [limps/plan, limps/worktype/feature]
created: 2026-01-26
updated: 2026-01-27
---

# limps Obsidian Plugin

## Overview

First-class Obsidian integration for limps - not just file compatibility, but a proper plugin with commands, views, and real-time sync.

## Why a Plugin (Not Just Files)

File compatibility gets you:
- ✅ Readable in Obsidian
- ✅ Graph view works
- ✅ Basic search

A plugin gets you:
- 🚀 Custom commands (`Ctrl+P` → "Create Agent", "Mark Task PASS")
- 🚀 Custom views (Plan dashboard, agent status board)
- 🚀 Real-time sync with limps server
- 🚀 Ribbon icons for quick actions
- 🚀 Status bar showing current plan/agent
- 🚀 Dataview-like queries without Dataview
- 🚀 Graph view enhancements (color by status, filter by plan)

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Obsidian                          │
│  ┌─────────────────────────────────────────────┐    │
│  │           limps-obsidian-plugin              │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────────┐    │    │
│  │  │Commands │ │ Views   │ │ File Watcher│    │    │
│  │  └────┬────┘ └────┬────┘ └──────┬──────┘    │    │
│  │       │           │             │           │    │
│  │       └───────────┼─────────────┘           │    │
│  │                   │                          │    │
│  │           ┌───────▼───────┐                 │    │
│  │           │  MCP Client   │                 │    │
│  │           └───────┬───────┘                 │    │
│  └───────────────────┼─────────────────────────┘    │
└──────────────────────┼──────────────────────────────┘
                       │ stdio/SSE
              ┌────────▼────────┐
              │   limps server   │
              │  (MCP over stdio)│
              └─────────────────┘
```

### Connection Strategy

**Option A: Spawn limps as child process**
- Plugin spawns `limps serve` on activation
- Communicate via stdio (like Cursor does)
- Pro: No external setup required
- Con: Another process running

**Option B: Connect to running limps**
- User runs `limps serve` separately
- Plugin connects via SSE/WebSocket
- Pro: Share server with Cursor
- Con: User must start server

**Recommendation:** Option A with fallback to B. Check if limps is running, connect if yes, spawn if no.

---

## Features

### Phase 1: Core Integration (MVP)

#### F1.1: Plan Dashboard View
- Custom leaf view showing all plans
- Status counts (GAP/WIP/PASS/BLOCKED)
- Click to open plan.md
- Quick-filter by status

#### F1.2: Agent Status Board
- Kanban-style view of agents
- Drag-drop to change status
- Shows dependencies as links
- Color-coded by persona

#### F1.3: Command Palette Integration
- `limps: Create New Plan`
- `limps: Create Agent for Current Plan`
- `limps: Mark Current Agent PASS`
- `limps: Get Next Task`
- `limps: Search Plans`

#### F1.4: Frontmatter Sync
- Auto-update `updated` field on save
- Validate frontmatter against schema
- Quick-fix suggestions for invalid frontmatter

### Phase 2: Graph Enhancements

#### F2.1: Graph Coloring
- Color nodes by status (green=PASS, yellow=WIP, red=BLOCKED, gray=GAP)
- Color by persona (blue=coder, purple=reviewer, etc.)
- Toggle via settings

#### F2.2: Graph Filtering
- Filter to show only current plan
- Filter by status
- Show/hide dependencies

#### F2.3: Custom Node Labels
- Show agent number + title instead of filename
- Show status badge on nodes

### Phase 3: Advanced Features

#### F3.1: Embedded Agent Blocks
- Render agent status inline in plan.md
- Live-updating status badges
- Click to jump to agent file

#### F3.2: Dependency Visualization
- Inline dependency graph in agent files
- "Blocked by" / "Blocks" sections auto-generated

#### F3.3: Semantic Search Integration
- `limps: Semantic Search` command
- Uses sqlite-vec + local ollama
- Shows results in modal

#### F3.4: Status Bar Widget
- Current plan name
- Agent counts by status
- Click for quick actions

---

## Technology Stack

| Component | Choice | Notes |
|-----------|--------|-------|
| Language | TypeScript | Obsidian plugin standard |
| Build | esbuild | Fast, Obsidian-recommended |
| MCP Client | @anthropic-ai/sdk or custom | Need to evaluate |
| State | Obsidian's native | WorkspaceLeaf, Settings, etc. |
| Styling | Obsidian CSS variables | Match user theme |

---

## File Structure

```
limps-obsidian-plugin/
├── src/
│   ├── main.ts              # Plugin entry point
│   ├── settings.ts          # Plugin settings
│   ├── mcp/
│   │   ├── client.ts        # MCP connection
│   │   └── types.ts         # MCP type definitions
│   ├── views/
│   │   ├── PlanDashboard.ts
│   │   ├── AgentBoard.ts
│   │   └── SearchModal.ts
│   ├── commands/
│   │   ├── createPlan.ts
│   │   ├── createAgent.ts
│   │   └── updateStatus.ts
│   ├── graph/
│   │   ├── enhancer.ts      # Graph view modifications
│   │   └── filters.ts
│   └── utils/
│       ├── frontmatter.ts
│       └── parser.ts
├── styles.css
├── manifest.json
├── package.json
└── esbuild.config.mjs
```

---

## Settings

```typescript
interface LimpsSettings {
  // Connection
  autoStartServer: boolean;        // Spawn limps if not running
  serverPath: string;              // Path to limps binary
  configPath: string;              // Path to limps config.json
  
  // Display
  showStatusBar: boolean;
  graphColoring: 'status' | 'persona' | 'none';
  defaultView: 'dashboard' | 'board';
  
  // Behavior
  autoUpdateTimestamp: boolean;    // Update 'updated' on save
  validateFrontmatter: boolean;
  showNotifications: boolean;
}
```

---

## Obsidian API Usage

| API | Use Case |
|-----|----------|
| `Plugin.addCommand()` | Register commands |
| `Plugin.registerView()` | Custom views |
| `Plugin.addRibbonIcon()` | Quick access button |
| `Plugin.addStatusBarItem()` | Status widget |
| `Workspace.getLeaf()` | Open views |
| `MetadataCache` | Read frontmatter |
| `Vault.modify()` | Update files |
| `FileManager.processFrontMatter()` | Safe frontmatter edits |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| MCP in Obsidian is weird | HIGH | Test early, may need custom transport |
| Graph API is limited | MEDIUM | Use CSS injection if needed |
| Obsidian version compat | LOW | Target v1.5+ (current mainstream) |
| Performance with many plans | MEDIUM | Lazy load, pagination |

---

## Success Criteria

- [ ] Can create/manage plans without leaving Obsidian
- [ ] Graph view shows meaningful colors/labels
- [ ] Status changes reflect in <1s
- [ ] Works offline (local-first)
- [ ] <50ms command execution
- [ ] Zero config for basic usage

---

## References

- [Obsidian Plugin API](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [sqlite-vec](https://github.com/asg017/sqlite-vec)
- [MCP Specification](https://modelcontextprotocol.io/)

---

## Status

Status: Planning
Work Type: feature
Created: 2026-01-26
