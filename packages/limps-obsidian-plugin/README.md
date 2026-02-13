# limps Obsidian Plugin (Bootstrap + Health MVP)

This package provides a local-first Obsidian plugin that wraps `limps` CLI commands.

## What this MVP includes

- Daemon status check command
- Health sidebar view
- Manual daemon prerequisite UX (clear startup guidance)
- Graph reindex command and refresh flow
- Event-driven refresh from vault/workspace/metadata changes (debounced)
- Status bar governance indicator (`daemon`, `links`, `mcp`)

## Commands

- `limps:check-daemon-status`
- `limps:open-health-view`
- `limps:refresh-health-view`
- `limps:graph-reindex`
- `limps:convert-deps-to-paths`
- `limps:sync-obsidian-graph-links`
- `limps:check-obsidian-mcp`
- `limps:audit-obsidian-surfaces`

## Local build

From repo root:

```bash
npm run build --workspace @sudosandwich/limps-obsidian-plugin
```

This creates `main.js` in this package directory.

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
limps server start --config /Users/paul/Documents/GitHub/limps/.limps/config.json
```

## Binary Selection

- Default behavior uses `limps` from your system `PATH` (production/global install).
- For local development builds, disable **Use system limps binary** in plugin settings and set a custom path.

## Obsidian MCP probe (optional)

- Enable **Enable Obsidian MCP checks** in plugin settings.
- Choose transport:
  - HTTP mode: set **Obsidian MCP endpoint** (default profile: `http://127.0.0.1:3000/mcp`)
  - stdio mode: set **Obsidian MCP command** (default `mcp-obsidian`) and optional args/cwd
- Run `limps:check-obsidian-mcp` to validate MCP connectivity.
- HTTP probe attempts JSON-RPC (`initialize`, `tools/list`) and falls back to `GET /health`.
- stdio probe performs JSON-RPC handshake (`initialize`, `tools/list`) directly against spawned server process.

## Runtime refresh model

- Periodic polling interval (configurable)
- Event-triggered debounce refresh on:
  - workspace `file-open`, `active-leaf-change`
  - vault `create`, `modify`, `rename`, `delete`
  - metadata cache `changed`, `resolved`

## Obsidian surface support

- Graph sync now projects plan-level links to:
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
