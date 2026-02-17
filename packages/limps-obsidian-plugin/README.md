# Local Intelligence Obsidian Plugin

This package provides a local-first Obsidian plugin for AI-assisted plan management via the limps daemon. It maintains a persistent MCP session with auto-reconnect, provides document/task management commands, scheduled health checks, vault event automation, and a directed graph view.

## What this includes

- Persistent MCP connection to the limps daemon (auto-reconnect, keepalive, CLI fallback)
- Health Hub sidebar view with daemon/graph/link/MCP status
- Directed LIMPS graph view (React Force Graph, 2D/3D toggle, clickable nodes)
- Document management commands (create, update, delete via MCP tools)
- Task management commands (get next task, update task status)
- Search and proposals UI (full-text search, proposal review/apply)
- Scheduled health checks with notification system
- Vault event automation (auto-reindex on plan file changes)
- Auto-proposal application for safe fix types
- Editor diagnostics (inline link validation)
- Status bar governance indicator (`daemon`, `links`, `mcp`)
- Graph sync to Obsidian surfaces (`.md`, `.canvas`, `.base`)

## Commands

### Core

- `limps:check-daemon-status` — Check if the limps daemon is running
- `limps:open-health-view` — Open the Health Hub sidebar
- `limps:refresh-health-view` — Force-refresh the Health Hub
- `limps:graph-reindex` — Trigger a full graph reindex
- `limps:open-directed-graph-view` — Open the directed graph editor view
- `limps:refresh-directed-graph-view` — Refresh the directed graph
- `limps:open-plugin-settings` — Open plugin settings tab

### Document Management

- `limps:create-doc` — Create a new plan document (prompts for plan number + title)
- `limps:update-doc` — Update an existing document (select from indexed docs)
- `limps:delete-doc` — Delete a document (select from indexed docs)

### Task Management

- `limps:get-next-task` — Find and display the next available task across plans
- `limps:update-task-status` — Update the status of a task (GAP/WIP/PASS/BLOCKED)

### Search & Proposals

- `limps:search-docs` — Full-text search across indexed plan documents
- `limps:show-proposals` — View current governance proposals
- `limps:apply-safe-proposals` — Apply all whitelisted safe proposals automatically

### Health & Automation

- `limps:run-health-check` — Run a manual health check (staleness, drift, conflicts)

### Graph & Surfaces

- `limps:convert-deps-to-paths` — Convert dependency references to file paths
- `limps:sync-obsidian-graph-links` — Sync plan links to Obsidian graph
- `limps:audit-obsidian-surfaces` — Audit `.md`/`.canvas`/`.base` surface counts

### Utilities

- `limps:check-obsidian-mcp` — Validate Obsidian MCP server connectivity
- `limps:use-repo-binary` — Set binary path to local repo build

## Persistent MCP Connection

The plugin maintains a persistent MCP session to the limps HTTP daemon via `McpClientManager`:

- Connects on plugin load when `enablePersistentMcp` is enabled
- Sends periodic keepalive pings (default: every 14 minutes)
- Auto-reconnects with exponential backoff on disconnection (up to 10 attempts)
- Falls back to CLI execution when MCP is unavailable
- Emits events: `connected`, `disconnected`, `reconnecting`, `error`

All document, task, search, and proposal commands use `LimpsToolWrapper`, which routes calls through MCP when connected and falls back to CLI otherwise.

## Settings Reference

### Binary & Paths

| Setting | Default | Description |
|---------|---------|-------------|
| `useSystemLimpsBinary` | `true` | Use `limps` from system PATH |
| `limpsPath` | `limps` | Custom binary path (when system binary disabled) |
| `configPath` | — | Path to `.limps/config.json` |

### Runtime

| Setting | Default | Description |
|---------|---------|-------------|
| `commandTimeoutMs` | `5000` | Max time for CLI commands |
| `healthRefreshMs` | `10000` | Health Hub auto-refresh interval |
| `eventRefreshDebounceMs` | `750` | Debounce for vault event triggers |

### UI

| Setting | Default | Description |
|---------|---------|-------------|
| `showHealthRibbon` | `true` | Show ribbon icon for Health Hub |
| `showStatusBar` | `true` | Show governance status bar |

### Persistent MCP Connection

| Setting | Default | Description |
|---------|---------|-------------|
| `enablePersistentMcp` | `true` | Maintain live MCP session |
| `mcpEndpoint` | `http://127.0.0.1:4269/mcp` | Daemon MCP endpoint |
| `mcpKeepaliveIntervalMs` | `840000` (14 min) | Keepalive ping interval |
| `mcpReconnectMaxAttempts` | `10` | Max reconnect attempts |

### Scheduled Health Checks

| Setting | Default | Description |
|---------|---------|-------------|
| `enableScheduledHealthChecks` | `false` | Run periodic health checks |
| `healthCheckIntervalMs` | `14400000` (4 hr) | Health check interval |
| `autoReindexOnChange` | `true` | Auto-reindex when plan files change |

### Auto-Proposals

| Setting | Default | Description |
|---------|---------|-------------|
| `autoApplyProposals` | `false` | Auto-apply safe proposal types |
| `autoApplyProposalTypes` | `frontmatter_cleanup, staleness_update, link_normalization` | Whitelisted types |
| `notifyOnIssuesFound` | `true` | Show notices for health/auto-fix issues |

### Obsidian MCP (optional)

| Setting | Default | Description |
|---------|---------|-------------|
| `enableObsidianMcp` | `false` | Probe an Obsidian MCP server |
| `obsidianMcpTransport` | `http` | Transport mode (`http` or `stdio`) |
| `obsidianMcpEndpoint` | `http://127.0.0.1:3000/mcp` | HTTP endpoint |
| `obsidianMcpCommand` | `mcp-obsidian` | stdio command |
| `obsidianMcpArgs` | — | stdio args |
| `obsidianMcpCwd` | — | stdio working directory |
| `obsidianMcpTimeoutMs` | `2500` | Probe timeout |

## Local build

From repo root:

```bash
npm run build --workspace @sudosandwich/limps-obsidian-plugin
```

This creates `main.js` in this package directory.

## Preview outside Obsidian (3D)

After building, run:

```bash
npm run preview:3d --workspace @sudosandwich/limps-obsidian-plugin -- /path/to/.limps/config.json
```

This starts a local preview server and opens a browser window with a standalone 3D graph for debugging.

## Sideload into Obsidian

1. Build this package.
2. Copy these files into your vault plugin folder:
   - `manifest.json`
   - `main.js`
   - `styles.css`
3. Folder destination:
   - `<your-vault>/.obsidian/plugins/limps-obsidian-plugin/`
4. In Obsidian, enable Community Plugins and turn on `Limps`.

## Required runtime prerequisite

Start limps daemon before using plugin commands:

```bash
limps server start --config /path/to/.limps/config.json
```

## Binary Selection

- Default behavior uses `limps` from your system `PATH` (production/global install).
- For local development builds, disable **Use system limps binary** in plugin settings and set a custom path.
- Use **Repo binary helper** in plugin settings or run `limps:use-repo-binary` to point to:
  - `<repo>/packages/limps/dist/cli.js`
- If system `limps` is missing, command execution auto-falls back to repo binary derived from config path.

## Runtime refresh model

- Periodic polling interval (configurable)
- Event-triggered debounce refresh on:
  - workspace `file-open`, `active-leaf-change`
  - vault `create`, `modify`, `rename`, `delete`
  - metadata cache `changed`, `resolved`
- Vault event handler filters to `.md` files within the plans directory only
- Auto-reindex on change can be toggled via settings

## Obsidian surface support

- Graph sync projects plan-level links to:
  - Markdown docs (`.md`)
  - Canvas boards (`.canvas`)
  - Bases files (`.base`)
- Use `limps:audit-obsidian-surfaces` to verify counts and detect empty canvas/base files.

## Troubleshooting

- If commands fail immediately:
  - Verify binary path in plugin settings (`limpsPath`).
- If health view shows disconnected:
  - Run the daemon start command above.
- If health view is empty:
  - Run command `limps:graph-reindex`.
- If MCP connection keeps disconnecting:
  - Check that the daemon is running on the configured endpoint.
  - Increase `mcpReconnectMaxAttempts` in settings.
- If auto-proposals are not applying:
  - Ensure `autoApplyProposals` is enabled and the proposal type is in `autoApplyProposalTypes`.
