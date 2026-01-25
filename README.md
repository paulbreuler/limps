# MCP Planning Server

MCP server for managing planning documents, agent coordination, and task tracking.

## Installation

### Global Install (Recommended)

```bash
npm install -g mcp-planning-server
```

The server automatically finds configuration at OS-specific locations:

| OS | Config Location |
|----|-----------------|
| macOS | `~/Library/Application Support/mcp-planning-server/config.json` |
| Linux | `~/.config/mcp-planning-server/config.json` |
| Windows | `%APPDATA%\mcp-planning-server\config.json` |

### From Source

```bash
git clone https://github.com/yourusername/mcp-planning-server.git
cd mcp-planning-server
npm install
npm run build
```

## Configuration

Create a `config.json` at the OS-specific location or specify a path:

```json
{
  "plansPath": "~/Documents/my-plans",
  "docsPaths": ["~/Documents/my-plans"],
  "fileExtensions": [".md"],
  "dataPath": "~/Library/Application Support/mcp-planning-server/data",
  "coordinationPath": "~/Library/Application Support/mcp-planning-server/coordination.json",
  "heartbeatTimeout": 300000,
  "debounceDelay": 200,
  "maxHandoffIterations": 3
}
```

**Config priority:**
1. CLI: `mcp-planning-server --config /path/to/config.json`
2. Environment: `MCP_PLANNING_CONFIG=/path/to/config.json`
3. OS-specific default location

**Path options:**
- Tilde expansion: `~/Documents/plans`
- Absolute: `/Users/john/Documents/plans`
- Relative (to config file): `./plans`

## Cursor Setup

Add to Cursor settings (`Cmd+Shift+P` → "Preferences: Open User Settings (JSON)"):

```json
{
  "mcp.servers": {
    "mcp-planning-server": {
      "command": "mcp-planning-server"
    }
  }
}
```

With explicit config:
```json
{
  "mcp.servers": {
    "mcp-planning-server": {
      "command": "mcp-planning-server",
      "args": ["--config", "/path/to/config.json"]
    }
  }
}
```

From source:
```json
{
  "mcp.servers": {
    "mcp-planning-server": {
      "command": "node",
      "args": ["/path/to/mcp-planning-server/dist/index.js"],
      "cwd": "/path/to/mcp-planning-server"
    }
  }
}
```

## Features

### Document Management (14 Tools)

| Tool | Description |
|------|-------------|
| `read_doc` | Read full document content |
| `create_doc` | Create new documents |
| `update_doc` | Update with optimistic concurrency |
| `delete_doc` | Delete documents |
| `list_docs` | List files and directories |
| `search_docs` | Full-text search (SQLite FTS5) |
| `rlm_query` | JavaScript filter/transform on documents |
| `rlm_multi_query` | Cross-document analysis with globs |
| `create_plan` | Create feature plans with structure |
| `update_task_status` | Update task status (GAP → WIP → PASS) |
| `claim_task` | Claim tasks with file locks |
| `release_task` | Release tasks and locks |
| `get_next_task` | Get highest-priority available task |
| `open_document_in_cursor` | Open files in Cursor editor |

### Resources (Progressive Disclosure)

- `plans://index` — List of all plans (minimal)
- `plans://summary` — Plan summaries (key info)
- `plans://full` — Full plan documents
- `decisions://log` — Decision log entries
- `agents://status` — Agent status and tasks

## Development

```bash
npm install       # Install dependencies
npm test          # Run tests
npm run build     # Build TypeScript
npm run dev       # Watch mode
npm run lint      # ESLint check
npm run format    # Prettier format
```

Pre-commit hooks run lint-staged, build, and tests automatically.

## Releasing

```bash
# Update version in package.json, then:
git tag v0.2.1
git push origin v0.2.1
```

GitHub Actions automatically builds, tests, and creates releases with changelogs.

## Architecture

- **SQLite + FTS5** — Full-text search with auto-updates
- **File Watching** — Real-time indexing (Chokidar)
- **Multi-Agent Coordination** — File-based with heartbeats
- **RLM Sandbox** — Secure JavaScript execution (QuickJS)

### Principles

1. Simplicity over complexity
2. Local-first, no external dependencies
3. Progressive disclosure (index → summary → full)
4. Optimistic concurrency
5. Scoring-based task selection

## Adapting for Other Uses

The server is designed for planning documents but the core is generic:

**Configuration-only:**
```json
{
  "plansPath": "./your-docs",
  "docsPaths": ["./content", "./docs"],
  "fileExtensions": [".md", ".txt", ".rst"]
}
```

**For different domains** (wikis, knowledge bases):
- Replace/remove planning-specific tools
- Customize document extractors in `src/rlm/extractors.ts`
- Modify coordination patterns or remove if single-agent

## What is MCP?

**MCP (Model Context Protocol)** is a standardized protocol for AI applications to connect to external systems. Launched by Anthropic (Nov 2024), now part of the Linux Foundation's Agentic AI Foundation.

- [MCP Specification](https://modelcontextprotocol.io/)
- [MCP Documentation](https://modelcontextprotocol.io/docs)

## License

MIT
