# limps

**L**ocal **I**ntelligent **M**CP **P**lanning **S**erver — A document and planning layer for AI assistants. No subscriptions, no cloud. Point limps at **any folder** (local, synced, or in git). One shared source of truth across Claude, Cursor, Codex, and any MCP-compatible tool.

[![npm](https://img.shields.io/npm/v/@sudosandwich/limps)](https://www.npmjs.com/package/@sudosandwich/limps)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Tests](https://img.shields.io/badge/Tests-1488%20passing-brightgreen)
![Coverage](https://img.shields.io/badge/Coverage-%3E70%25-brightgreen)
[![MCP Badge](https://lobehub.com/badge/mcp/paulbreuler-limps)](https://lobehub.com/mcp/paulbreuler-limps)

![limps in action](https://github.com/paulbreuler/limps/blob/main/.github/assets/limps-a-lol-longer.gif?raw=true)

## Table of Contents

- [Quick Start](#quick-start)
- [Features](#features)
- [How I Use limps](#how-i-use-limps)
- [Health & Automation](#health--automation)
- [How You Can Use It](#how-you-can-use-it)
- [Why limps?](#why-limps)
- [Installation](#installation)
- [Upgrading from v2](#upgrading-from-v2)
- [Project Setup](#project-setup)
- [Client Setup](#client-setup)
- [Transport](#transport)
- [Daemon Management](#daemon-management)
- [CLI Commands](#cli-commands)
- [Configuration](#configuration)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)
- [MCP Tools](#mcp-tools)
- [Skills & Commands](#skills--commands)
- [Extensions](#extensions)
- [Obsidian Compatibility](#obsidian-compatibility)
- [Development](#development)
- [Used in Production](#used-in-production)
- [Creating a feature plan](#creating-a-feature-plan)
- [Deep Dive](#deep-dive)
- [What is MCP?](#what-is-mcp)
- [License](#license)

## Quick Start

```bash
# Install globally
npm install -g @sudosandwich/limps

# Initialize in your project
cd ~/Documents/my-planning-docs
limps init

# Start the HTTP daemon
limps start
# → Daemon starts on http://127.0.0.1:4269/mcp
# → PID file written to OS-standard location
# → Ready for MCP client connections

# Generate MCP client config
limps config print --client claude-code
# Copy the output to your MCP client config file
```

That's it. Your AI assistant now has access to your documents via HTTP transport. The folder can be anywhere—local, synced, or in a repo; limps does not require a git repository or a `plans/` directory.

**Tip:** `limps server-status` always includes system-wide daemon discovery. If a project config is found (or passed via `--config`), it also reconciles the configured project target against that global list.

## Features

- **Document CRUD + full-text search** across any folder of Markdown files
- **Plan + agent workflows** with status tracking and task scoring
- **Next-task suggestions** with score breakdowns and bias tuning
- **Sandboxed document processing** via `process_doc(s)` helpers
- **Multi-client support** for Cursor, Claude, Codex, and more
- **Extensions** for domain-specific tooling (e.g., limps-headless)
- **Knowledge graph** — Entity extraction, hybrid retrieval, conflict detection, and graph-based suggestions
- **Health automation** — Staleness detection, code drift checks, status inference, and auto-fix proposals
- **Advanced task scoring** — Dependency-aware prioritization with per-plan/agent weight overrides
- **MCP Registry** — Published to the official MCP Registry (`registry.modelcontextprotocol.io`)

### What to know before you start

- **Local only** — Your data stays on disk (SQLite index + your files). No cloud, no subscription.
- **Restart after changes** — If you change the indexed folder or config, restart the MCP server (or rely on the file watcher) so the index and tools reflect the current state.
- **Daemon management** — The HTTP server runs as a background process. Use `limps start`, `limps stop`, and `limps server-status` to manage the daemon lifecycle. PID files are stored in OS-standard directories for system-wide awareness.
- **Sandboxed user code** — `process_doc` and `process_docs` run your JavaScript in a QuickJS sandbox with time and memory limits; no network or Node APIs.
- **One optional network call** — `limps version --check` fetches from the npm registry to compare versions. All other commands (serve, init, list, search, create/update/delete docs, process_doc, etc.) do **not** contact the internet. Omit `version --check` if you want zero external calls.

## How I Use limps

I use `limps` as a local planning layer across multiple AI tools, focused on **create → read → update → closure** for plans and tasks. The MCP server points at whatever directory I want (not necessarily a git repo), so any client reads and updates the same source of truth.

Typical flow:

1. Point limps at a docs directory (any folder, local or synced).
2. Use CLI + MCP tools to create plans/docs, read the current status, update tasks, and close work when done.
3. Add the limps MCP entry to each client config so Cursor/Claude/Codex all see the same plans.

Commands and tools I use most often:

- **Create**: `limps init`, `create_plan`, `create_doc`
- **Read**: `list_plans`, `list_agents`, `list_docs`, `search_docs`, `get_plan_status`
- **Update**: `update_doc`, `update_task_status`, `manage_tags`
- **Close**: `update_task_status` (e.g., `PASS`), `delete_doc` if needed
- **Analyze**: `graph health`, `graph search`, `graph check`, `health check`

Full lists are below in "CLI Commands" and "MCP Tools."

## How You Can Use It

`limps` is designed to be generic and portable. Point it at **any folder** with Markdown files and use it from any MCP-compatible client. **No git repo required.** **Not limited to planning**—planning (plans, agents, task status) is one use case; the same layer gives you document CRUD, full-text search, and programmable processing on any indexed folder.

Common setups:

- **Single project**: One docs folder for a product.
- **Multi-project**: Each project gets its own `.limps/config.json`; pass `--config` to target a specific one.
- **Shared team folder**: Put plans in a shared location and review changes like code.
- **Local-first**: Keep everything on disk, no hosted service required.

Key ideas:

- **Any folder** — You choose the path; if there’s no `plans/` subdir, the whole directory is indexed. Use generic tools (`list_docs`, `search_docs`, `create_doc`, `update_doc`, `delete_doc`, `process_doc`, `process_docs`) or plan-specific ones (`create_plan`, `list_plans`, `list_agents`, `get_plan_status`, `update_task_status`, `get_next_task`).
- **One source of truth** — MCP tools give structured access; multiple clients share the same docs.

## Why limps?

**The problem:** Each AI assistant maintains its own context. Planning documents, task status, and decisions get fragmented across Claude, Cursor, ChatGPT, and Copilot conversations.

**The solution:** limps provides a standardized MCP interface that any tool can access. Your docs live in one place—a folder you choose. Use git (or any sync) if you want version control; limps is not tied to a repository.

## Installation

```bash
npm install -g @sudosandwich/limps
```

## Upgrading from v2

v3 introduces major changes:

### HTTP Transport (Breaking Change)

v3 uses **HTTP transport exclusively**. stdio transport has been removed.

**Migration steps:**

1. **Start the HTTP daemon** for each project:
   ```bash
   limps start --config /path/to/.limps/config.json
   ```

2. **Update MCP client configs** — Replace stdio configs with HTTP transport:
   ```json
   {
     "mcpServers": {
       "limps-planning-myproject": {
         "transport": {
           "type": "http",
           "url": "http://127.0.0.1:4269/mcp"
         }
       }
     }
   }
   ```
   Use `limps config print` to generate the correct snippet.

### Per-Project Configs (Breaking Change)

v3 removes the centralized project registry. If you previously used `limps config add`, `config use`, or the `--project` flag:

1. **Run `limps init`** in each project directory to create `.limps/config.json`.
2. **Update MCP client configs** — Replace `--project <name>` with HTTP transport config (see above).
3. **Remove environment variable** — `LIMPS_PROJECT` no longer exists. Use `MCP_PLANNING_CONFIG` to override config path.

**Removed commands:** `config list`, `config use`, `config add`, `config remove`, `config set`, `config discover`, `config migrate`, `config sync-mcp`, `serve`.

**Replaced by:** `limps init` + `limps start` + `limps config print`.

## Project Setup

### Initialize a New Project

```bash
cd ~/Documents/my-planning-docs
limps init
```

This creates `.limps/config.json` in the current directory and prints MCP client setup instructions.

You can also specify a path:

```bash
limps init ~/Documents/my-planning-docs
```

If the directory contains a `plans/` subdirectory, limps uses it. Otherwise, it indexes the entire directory.

### Multiple Projects

Each project has its own `.limps/config.json`. Use `--config` to target a specific project:

```bash
limps list-plans --config ~/docs/project-b/.limps/config.json
```

## Client Setup

After running `limps init`, you need to add a limps entry to your MCP client's config file. Use `limps config print` to generate the correct snippet for your client, then paste it into the appropriate config file:

```bash
limps config print --client cursor
limps config print --client claude-code
limps config print --client claude
```

The output tells you exactly what JSON (or TOML) to add and where the config file lives.

### Per-Client Examples

All clients connect to the HTTP daemon. Start the daemon first with `limps start`, then configure your client.

<details>
<summary><b>Cursor</b></summary>

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "limps-planning-myproject": {
      "transport": {
        "type": "http",
        "url": "http://127.0.0.1:4269/mcp"
      }
    }
  }
}
```

</details>

<details>
<summary><b>Claude Code</b></summary>

Add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "limps-planning-myproject": {
      "transport": {
        "type": "http",
        "url": "http://127.0.0.1:4269/mcp"
      }
    }
  }
}
```

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "limps-planning-myproject": {
      "transport": {
        "type": "http",
        "url": "http://127.0.0.1:4269/mcp"
      }
    }
  }
}
```

</details>

<details>
<summary><b>OpenAI Codex</b></summary>

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.limps-planning-myproject.transport]
type = "http"
url = "http://127.0.0.1:4269/mcp"
```

</details>

<details>
<summary><b>ChatGPT</b></summary>

ChatGPT requires a remote MCP server over HTTPS. Deploy limps behind an MCP-compatible HTTPS reverse proxy (nginx, Caddy, etc.) with authentication.

In ChatGPT → Settings → Connectors → Add custom connector:

- **Server URL**: `https://your-domain.example/mcp`
- **Authentication**: Configure as needed for your proxy

Print setup instructions:

```bash
limps config print --client chatgpt
```

</details>

## Transport

limps v3 uses **HTTP transport exclusively** via a persistent daemon. This allows multiple MCP clients to share a single server instance, avoiding file descriptor bloat from multiple stdio processes.

### Start the HTTP daemon

```bash
# Start the daemon
limps start

# Check status (shows uptime, sessions, PID)
limps server-status

# Stop the daemon
limps stop
```

The daemon runs at `http://127.0.0.1:4269/mcp` by default. Use `limps config print` to generate the correct MCP client configuration:

```bash
limps config print --client claude-code
```

See [Daemon Management](#daemon-management) for detailed lifecycle documentation.

### MCP Client Configuration

All clients use HTTP transport. Example config:

```json
{
  "mcpServers": {
    "limps-planning-myproject": {
      "transport": {
        "type": "http",
        "url": "http://127.0.0.1:4269/mcp"
      }
    }
  }
}
```

### Server Config Options

Customize the HTTP server by adding a `"server"` section to your `config.json`:

| Option             | Default                | Description                              |
| ------------------ | ---------------------- | ---------------------------------------- |
| `port`             | `4269`                 | HTTP listen port                         |
| `host`             | `127.0.0.1`            | Bind address                             |
| `maxSessions`      | `100`                  | Maximum concurrent MCP sessions          |
| `sessionTimeoutMs` | `1800000`              | Session idle timeout in ms (30 min)      |
| `corsOrigin`       | `""` (none)            | CORS origin (`""`, `"*"`, or a URL)      |
| `maxBodySize`      | `10485760`             | Max request body in bytes (10 MB)        |
| `rateLimit`        | `100 req/min`          | Rate limit per client IP                 |

Example custom server config:

```json
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0"
  }
}
```

**Note:** PID files are stored in OS-standard application directories:
- **macOS**: `~/Library/Application Support/limps/pids/`
- **Linux**: `$XDG_DATA_HOME/limps/pids/` or `~/.local/share/limps/pids/`
- **Windows**: `%APPDATA%/limps/pids/`

This enables `limps server-status` to perform system-wide daemon discovery from any directory. When a limps config is found for the current directory (or passed via `--config`), the CLI also reports and reconciles that project's configured target.

- **Remote clients**: Use an MCP-compatible HTTPS proxy for remote clients (e.g., ChatGPT).

## Daemon Management

limps v3 uses a persistent HTTP daemon with system-wide awareness. PID files are stored in OS-standard directories, allowing you to manage and discover daemons from any directory on your system.

### PID File Locations

PID files are stored in platform-specific application data directories:

**macOS:**
```
~/Library/Application Support/limps/pids/
```

**Linux:**
```
$XDG_DATA_HOME/limps/pids/
# or if XDG_DATA_HOME is not set:
~/.local/share/limps/pids/
```

**Windows:**
```
%APPDATA%/limps/pids/
```

Each PID file is named by port number (`limps-{port}.pid`) to enable system-wide discovery. Example PID file structure:

```json
{
  "pid": 12345,
  "port": 4269,
  "host": "127.0.0.1",
  "startedAt": "2026-02-08T12:00:00.000Z",
  "configPath": "/path/to/project/.limps/config.json",
  "logPath": "/Users/you/Library/Application Support/limps/logs/limps-4269.log"
}
```

This port-based naming allows `limps server-status` to find all running daemons across different projects without needing a config file.

Daemon logs are written to OS-standard application log directories:

**macOS:**
```
~/Library/Application Support/limps/logs/
```

**Linux:**
```
$XDG_DATA_HOME/limps/logs/
# or if XDG_DATA_HOME is not set:
~/.local/share/limps/logs/
```

**Windows:**
```
%APPDATA%/limps/logs/
```

### Starting the Daemon

**Background mode (default):**

```bash
limps start
# → Daemon starts on http://127.0.0.1:4269/mcp
# → PID file written to OS-standard location
# → Logs written to OS-standard log file (append mode)
# → Process detaches and runs in background
```

**Foreground mode (debugging):**

```bash
limps start --foreground
# → Runs in foreground (blocks terminal)
# → Logs appear in stderr
# → Useful for debugging startup issues
# → Still creates PID file for discovery
```

**Custom port/host (via config):**

Configure `server.port` and `server.host` in your `.limps/config.json`:

```json
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0"
  }
}
```

Then start normally:

```bash
limps start
# → Starts using server.port/server.host from config
# → PID file: limps-8080.pid
```

The `start` command performs health verification by polling the `/health` endpoint for up to 5 seconds, issuing repeated HTTP requests. Each individual health-check request has its own shorter timeout (for example, ~1000ms). If any request fails during this window, you'll see one of these error codes:

- **TIMEOUT** — A single health-check HTTP request exceeded its per-request timeout (e.g., ~1000ms). The daemon may be slow to start or system resources may be constrained. Try `limps start --foreground` to see logs.
- **NETWORK_ERROR** — Cannot connect to daemon. Port may be blocked or already in use by another process.
- **NON_200_STATUS** — Health endpoint returned a non-200 status code. Check daemon logs with foreground mode.
- **INVALID_RESPONSE** — Health endpoint responded, but the response was invalid or could not be parsed as expected (for example, malformed or missing required fields).

### Checking Daemon Status

**With project config (reconciled with global discovery):**

```bash
# From within a project directory with .limps/config.json
limps server-status
# Project target:
# limps server is running
# PID: 12345 | 127.0.0.1:4269
# Uptime: 2h 15m
# Sessions: 3
# Log: /Users/you/Library/Application Support/limps/logs/limps-4269.log
# Project target is present in system-wide daemon discovery.
# System-wide daemons:
# 127.0.0.1:4269 (PID 12345) [project target]
#   Uptime: 2h 15m | Sessions: 3
#   Log: /Users/you/Library/Application Support/limps/logs/limps-4269.log

# Or specify config explicitly
limps server-status --config /path/to/.limps/config.json
```

**Without project config (global discovery only):**

```bash
# From a directory without a limps config
cd /tmp
limps server-status
# Found 2 running daemons:
# 127.0.0.1:4269 (PID 12345)
#   Uptime: 2h 15m | Sessions: 3
#   Log: /Users/you/Library/Application Support/limps/logs/limps-4269.log
# 127.0.0.1:8080 (PID 67890)
#   Uptime: 45m 30s | Sessions: 1
#   Log: /Users/you/Library/Application Support/limps/logs/limps-8080.log
```

When `limps server-status` cannot resolve a config file in the current directory (and no `--config` is provided), it reports global daemon discovery only. When a config is found, it reports both the configured project target and the global daemon list.

### Stopping the Daemon

```bash
# From the project directory (where your .limps config lives):
limps stop
# → Gracefully shuts down daemon
# → Closes all MCP sessions
# → Stops file watchers
# → Removes PID file
# → Process exits

# Or from any directory, by specifying the config explicitly:
limps stop --config /path/to/.limps/config.json
```

The `stop` command is project-specific and resolves the config to determine which daemon to stop. The daemon performs a graceful shutdown by:
1. Closing all active MCP sessions
2. Shutting down file watchers
3. Removing the PID file
4. Exiting the process

### Port Conflicts

If you try to start a daemon on a port that's already in use, limps will detect the conflict and provide resolution guidance:

```bash
limps start
# Error: Port 4269 is already in use.
# Process using port: node (PID 12345)
# Command: /usr/local/bin/node /usr/local/bin/limps start
#
# To stop the process: kill 12345
# Or use a different port: limps start --port <port>
```

On systems with `lsof` available (macOS, Linux), limps can identify which process is using the port and show its command line. If `lsof` is not available, you'll see a simpler error message suggesting a different port.

### Foreground Mode

Use foreground mode for debugging, Docker deployments, or CI/CD pipelines:

```bash
limps start --foreground
```

**Use cases:**
- **Debugging** — See server logs in real-time to diagnose startup issues
- **Docker** — Keep container alive with the daemon as the main process
- **CI/CD** — Run tests against a limps daemon without background processes

**Behavior differences from background mode:**
- Logs to stderr instead of being silent
- Blocks the terminal (press Ctrl+C to stop)
- Still creates a PID file for discovery by other processes
- Responds to SIGINT (Ctrl+C) and SIGTERM for graceful shutdown

### Health Endpoint

The HTTP daemon exposes a `/health` endpoint for monitoring and health checks:

```bash
curl http://127.0.0.1:4269/health
```

**Example response:**

```json
{
  "status": "ok",
  "sessions": 3,
  "uptime": 8145,
  "pid": 12345,
  "sessionTimeoutMs": 1800000
}
```

**HTTP status codes:**
- **200** — Daemon is healthy and accepting connections
- **429** — Rate limit exceeded (rate limiter may return this before the request reaches `/health`)

Use this endpoint for:
- Monitoring daemon health in scripts or dashboards
- Verifying daemon is running before connecting MCP clients
- Automated health checks in orchestration tools (Kubernetes, Docker Compose)

### Multiple Daemons

You can run multiple limps daemons on different ports for different projects by configuring different ports in each project's config:

```bash
# Project A with default port (4269)
cd ~/projects/project-a
# .limps/config.json has server.port: 4269 (or uses default)
limps start
# → Running on http://127.0.0.1:4269/mcp

# Project B with custom port (8080)
cd ~/projects/project-b
# .limps/config.json has server.port: 8080
limps start
# → Running on http://127.0.0.1:8080/mcp
```

Each daemon has its own PID file:
- `limps-4269.pid` — Project A
- `limps-8080.pid` — Project B

Discover all running daemons (run from a directory without a limps config):

```bash
cd /tmp
limps server-status
# Found 2 running daemons:
# 127.0.0.1:4269 (PID 12345)
#   Uptime: 2h 15m | Sessions: 3
# 127.0.0.1:8080 (PID 67890)
#   Uptime: 45m 30s | Sessions: 1
```

Each MCP client can connect to different daemons by configuring different URLs in their config files.

## CLI Commands

### Viewing Plans

```bash
limps list-plans              # List all plans with status
limps list-agents <plan>      # List agents in a plan
limps status <plan>           # Show plan progress summary
limps next-task <plan>        # Get highest-priority available task
```

### Project Management

```bash
limps init [path]             # Initialize new project
limps start                   # Start HTTP daemon (background by default)
limps start --foreground      # Start in foreground (debugging mode)
limps stop                    # Stop HTTP daemon
limps server-status           # Show daemon status (current project or all daemons)
limps config show             # Display current config
limps config print            # Print MCP client config snippets
```

### Health & Automation

```bash
limps health check              # Aggregate all health signals
limps health staleness [plan]   # Find stale plans/agents
limps health drift [plan]       # Detect file reference drift
limps health inference [plan]   # Suggest status updates
limps proposals list             # List auto-fix proposals
limps proposals apply <id>       # Apply a proposal
limps proposals apply-safe       # Apply all safe proposals
```

### Knowledge Graph

```bash
limps graph reindex              # Build/rebuild graph
limps graph health               # Graph stats and conflicts
limps graph search <query>       # Search entities
limps graph trace <entity>       # Trace relationships
limps graph entity <id>          # Entity details
limps graph overlap              # Find overlapping features
limps graph check [type]         # Run conflict detection
limps graph suggest <type>       # Graph-based suggestions
limps graph watch                # Watch and update incrementally
```

### Scoring & Repair

```bash
limps score-all <plan>           # Score all agents in a plan
limps score-task <task-id>       # Score a single task
limps repair-plans [--fix]       # Check/fix agent frontmatter
```

## Configuration

Config lives at `.limps/config.json` in your project directory, created by `limps init`.

### Config Options

```json
{
  "plansPath": "./plans",
  "docsPaths": ["."],
  "fileExtensions": [".md"],
  "dataPath": ".limps/data",
  "extensions": ["@sudosandwich/limps-headless"],
  "tools": {
    "allowlist": ["list_docs", "search_docs"]
  },
  "scoring": {
    "weights": { "dependency": 40, "priority": 30, "workload": 30 },
    "biases": {}
  }
}
```

| Option           | Description                                                |
| ---------------- | ---------------------------------------------------------- |
| `plansPath`      | Directory for structured plans (`NNNN-name/` with agents)  |
| `docsPaths`      | Additional directories to index                            |
| `fileExtensions` | File types to index (default: `.md`)                       |
| `dataPath`       | SQLite database location                                   |
| `tools`          | Tool allowlist/denylist filtering                          |
| `extensions`     | Extension packages to load                                 |
| `scoring`        | Task prioritization weights and biases                     |
| `server`         | HTTP daemon settings (port, host, CORS, sessions, timeout) |
| `graph`          | Knowledge graph settings (e.g., entity extraction options) |
| `retrieval`      | Search recipe configuration for hybrid retrieval           |

## Environment Variables

| Variable               | Description                                                | Example                                           |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| `MCP_PLANNING_CONFIG`  | Path to config file (overrides default discovery)          | `MCP_PLANNING_CONFIG=./my-config.json limps serve`|
| `LIMPS_ALLOWED_TOOLS`  | Comma-separated allowlist; only these tools are registered | `LIMPS_ALLOWED_TOOLS="list_docs,search_docs"`     |
| `LIMPS_DISABLED_TOOLS` | Comma-separated denylist; tools to hide                    | `LIMPS_DISABLED_TOOLS="process_doc,process_docs"` |

**Precedence:** `config.tools` overrides env vars. If allowlist is set, denylist is ignored.

## Troubleshooting

### Daemon Won't Start

**"Port already in use" error:**

If you see this error, another process is using the port:

```bash
limps start
# Error: Port 4269 is already in use.
# Process using port: node (PID 12345)
```

**Resolution:**
1. **Kill the existing process**: `kill 12345`
2. **Or use a different port**: `limps start --port 8080`
3. **Check if it's another limps daemon**: `limps server-status` (if so, use `limps stop` first)

**"Daemon may have failed to start" error:**

If the daemon starts but doesn't respond to health checks:

```bash
limps start
# Error: Daemon may have failed to start. Check logs or try: limps start --foreground
```

**Resolution:**
1. **Check daemon log path**: `limps server-status` (or run foreground mode: `limps start --foreground`)
2. **Check for permission issues**: Ensure you have write access to the PID directory
3. **Verify port is accessible**: Try `curl http://127.0.0.1:4269/health`
4. **Enable debug logging**: `DEBUG=1 limps start --foreground`

**Permission issues with PID directory:**

If you can't create PID files:

```bash
# macOS
ls -la ~/Library/Application\ Support/limps/pids/

# Linux
ls -la ~/.local/share/limps/pids/

# Windows
dir %APPDATA%\limps\pids
```

Ensure the directory exists and you have write permissions. If not, create it manually:

```bash
# macOS
mkdir -p ~/Library/Application\ Support/limps/pids

# Linux
mkdir -p ~/.local/share/limps/pids

# Windows
mkdir %APPDATA%\limps\pids
```

### Health Check Failures

**TIMEOUT error:**

The daemon did not respond within the configured timeout. Each health-check request has its own timeout (for example, 1000ms during the final `limps start` check and 3000ms for `server-status`), and during startup limps will poll for up to about 5 seconds before reporting "Daemon may have failed to start".

**Common causes:**
- System resource constraints (high CPU/memory usage)
- Slow filesystem (especially for index initialization)
- Large document corpus requiring time to index

**Resolution:**
1. Check system resources: `top` or Activity Monitor
2. Wait a bit longer and retry: `limps server-status`
3. Run in foreground to see progress: `limps start --foreground`

**NETWORK_ERROR:**

Cannot establish connection to the daemon.

**Common causes:**
- Port is blocked by firewall
- Daemon crashed after starting
- Incorrect host/port configuration

**Resolution:**
1. Verify daemon is running: `limps server-status`
2. Check firewall settings for port 4269
3. Try `curl http://127.0.0.1:4269/health` manually
4. Check daemon logs: see `Log:` path in `limps server-status` output

### Stale PID Files

limps automatically cleans up stale PID files when:
- Running `limps server-status` (discovers and removes stale files)
- Running `limps start` (removes stale file for the target port)
- The daemon shuts down gracefully with `limps stop`

If you need to manually clean up PID files:

```bash
# macOS
rm ~/Library/Application\ Support/limps/pids/limps-*.pid

# Linux
rm ~/.local/share/limps/pids/limps-*.pid

# Windows
del %APPDATA%\limps\pids\limps-*.pid
```

**When to manually clean up:**
- After a system crash or forced shutdown
- If `limps start` reports a daemon is running but it's not
- Before uninstalling limps

### Multiple Daemons Conflict

If you accidentally try to start a second daemon on the same port:

```bash
limps start
# Error: limps daemon already running (PID 12345 on 127.0.0.1:4269). Run 'limps stop' first.
```

This is expected behavior — limps prevents multiple daemons on the same port using PID-based locking.

**Resolution:**
1. **Check all running daemons**: `limps server-status`
2. **Stop the existing daemon**: `limps stop`
3. **Or start on a different port**: `limps start --port 8080`

### Debugging Connection Issues

If MCP clients can't connect to the daemon, verify connectivity step by step:

**1. Check daemon status:**

```bash
limps server-status
# Should show daemon running with healthy status
```

**2. Verify health endpoint:**

```bash
curl http://127.0.0.1:4269/health
# Should return JSON with status "ok"
```

**3. Verify MCP endpoint:**

```bash
curl -X POST http://127.0.0.1:4269/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}'
# Should return MCP initialize response
```

**4. Enable debug logging:**

```bash
DEBUG=1 limps start --foreground
# Watch for connection attempts and errors
```

**5. Check MCP client config:**

Ensure the URL in your client config matches the daemon:

```json
{
  "mcpServers": {
    "limps-planning-myproject": {
      "transport": {
        "type": "http",
        "url": "http://127.0.0.1:4269/mcp"
      }
    }
  }
}
```

## MCP Tools

limps exposes MCP tools for AI assistants:

| Category            | Tools                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Documents**       | `process_doc`, `process_docs`, `create_doc`, `update_doc`, `delete_doc`, `list_docs`, `search_docs`, `manage_tags`, `open_document_in_cursor` |
| **Plans**           | `create_plan`, `list_plans`, `list_agents`, `get_plan_status`                                                                                 |
| **Tasks**           | `get_next_task`, `update_task_status`, `configure_scoring`                                                                                    |
| **Health**          | `check_staleness`, `check_drift`, `infer_status`, `get_proposals`, `apply_proposal`                                                           |
| **Knowledge Graph** | `graph` (unified: health, search, trace, entity, overlap, reindex, check, suggest)                                                            |

### Knowledge Graph

The knowledge graph builds a structured, queryable representation of your planning documents. It extracts 6 entity types (**plan**, **agent**, **feature**, **file**, **tag**, **concept**) and their relationships (ownership, dependency, modification, tagging, conceptual links). Use it to find conflicts, trace dependencies, and get graph-based suggestions.

```bash
# Build the graph from plan files
limps graph reindex

# Check graph health and conflicts
limps graph health --json

# Search entities
limps graph search "auth" --json

# Trace relationships
limps graph trace plan:0042 --direction down

# Detect conflicts (file contention, circular deps, stale WIP)
limps graph check --json

# Get graph-based suggestions
limps graph suggest dependency-order
```

See [Knowledge Graph Architecture](docs/knowledge-graph.md) and [CLI Reference](docs/cli-reference.md) for details.

### Health & Automation

limps includes automated health checks that detect issues and suggest fixes:

- **Staleness** — Flags plans/agents not updated within configurable thresholds
- **Code drift** — Detects when agent frontmatter references files that no longer exist
- **Status inference** — Suggests status changes based on dependency completion and body content
- **Proposals** — Aggregates all suggestions into reviewable, apply-able fixes

```bash
limps health check --json        # Run all checks
limps proposals apply-safe       # Auto-apply safe fixes
```

## Skills & Commands

This repo ships Claude Code slash commands in [`.claude/commands/`](/.claude/commands/) and a [Vercel Skills](https://github.com/vercel-labs/skills) skill in `skills/limps-planning`.

**Claude Code commands** (available automatically when limps is your working directory):

| Command                | Description                           |
| ---------------------- | ------------------------------------- |
| `/create-feature-plan` | Create a full TDD plan with agents    |
| `/run-agent`           | Pick up and execute the next agent    |
| `/close-feature-agent` | Mark an agent PASS and clean up       |
| `/update-feature-plan` | Revise an existing plan               |
| `/audit-plan`          | Audit a plan for completeness         |
| `/list-feature-plans`  | List all plans with status            |
| `/plan-list-agents`    | List agents in a plan                 |
| `/plan-check-status`   | Check plan progress                   |
| `/pr-create`           | Create a PR from the current branch   |
| `/pr-check-and-fix`    | Fix CI failures and update PR         |
| `/pr-comments`         | Review and respond to PR comments     |
| `/review-branch`       | General code review of current branch |
| `/review-mcp`          | Review code for MCP/LLM safety        |
| `/attack-cli-mcp`      | Stress-test CLI + MCP for robustness  |

**Vercel Skills** (for other AI IDEs):

Install the limps planning skill to get AI-powered guidance for plan creation, agent workflows, and task management:

```bash
# Install only the limps planning skill (recommended for consumers)
npx skills add https://github.com/sudosandwich/limps/tree/main/.claude/skills/limps-plan-operations

# Or install all available skills
npx skills add sudosandwich/limps
```

**Available Skills:**

| Skill | Description |
|-------|-------------|
| `limps-plan-operations` | Plan identification, artifact loading, distillation rules, and lifecycle guidance using limps MCP tools |
| `mcp-code-review` | Security-focused code review for MCP servers and LLM safety |
| `branch-code-review` | General code review for design, maintainability, and correctness |
| `git-commit-best-practices` | Conventional commits and repository best practices |

See [`skills.yaml`](./skills.yaml) for the complete manifest of the `.claude/skills` packages installed via `npx skills add` above; the separate `skills/limps-planning/` package in this repo is a legacy distribution and new consumers should prefer the `.claude/skills` method.

## Extensions

Extensions add MCP tools and resources. Install from npm:

```bash
npm install -g @sudosandwich/limps-headless
```

Add to config:

```json
{
  "extensions": ["@sudosandwich/limps-headless"],
  "limps-headless": {
    "cacheDir": "~/Library/Application Support/limps-headless"
  }
}
```

**Available extensions:**

- `@sudosandwich/limps-headless` — Headless UI contract extraction, semantic analysis, and drift detection (Radix UI and Base UI migration).

## Obsidian Compatibility

limps works with Obsidian vaults. Open your `plans/` directory as a vault for visual editing:

- Full YAML frontmatter support
- Tag management (frontmatter and inline `#tag`)
- Automatic exclusion of `.obsidian/`, `.git/`, `node_modules/`

![Obsidian vault with limps plans](https://github.com/paulbreuler/limps/blob/main/.github/assets/obsidian-vault.png?raw=true)

## Development

```bash
git clone https://github.com/paulbreuler/limps.git
cd limps
npm install
npm run build
npm test
```

This is a monorepo with:

- `packages/limps` — Core MCP server
- `packages/limps-headless` — Headless UI extension (Radix/Base UI contract extraction and audit)

## Used in Production

limps manages planning for [runi](https://github.com/paulbreuler/runi), using a separate folder (in this case a git repo) for plans.

---

## Creating a feature plan

The fastest way is the `/create-feature-plan` slash command (Claude Code) — it handles numbering, doc creation, and agent distillation automatically via MCP tools. See [`.claude/commands/create-feature-plan.md`](/.claude/commands/create-feature-plan.md) for the full spec.

You can also run the same steps manually with MCP tools:

1. `list_plans` → determine next plan number
2. `create_plan` → scaffold the plan directory
3. `create_doc` → add plan, interfaces, README, and agent files
4. `update_task_status` → track progress

Plans follow this layout:

```
NNNN-descriptive-name/
├── README.md
├── NNNN-descriptive-name-plan.md
├── interfaces.md
└── agents/
    ├── 000_agent_infrastructure.agent.md
    ├── 001_agent_feature-a.agent.md
    └── ...
```

Numbered prefixes keep plans and agents lexicographically ordered. `get_next_task` uses the agent number (plus dependency and workload scores) to suggest what to work on next.

## Deep Dive

<details>
<summary><b>Plan Structure</b></summary>

```
plans/
├── 0001-feature-name/
│   ├── 0001-feature-name-plan.md    # Main plan with specs
│   ├── interfaces.md                 # Interface contracts
│   ├── README.md                     # Status index
│   └── agents/                       # Task files
│       ├── 000-setup.md
│       ├── 001-implement.md
│       └── 002-test.md
└── 0002-another-feature/
    └── ...
```

Agent files use frontmatter to track status:

```yaml
---
status: GAP | WIP | PASS | BLOCKED
persona: coder | reviewer | pm | customer
depends_on: ["000-setup"]
files:
  - src/components/Feature.tsx
---
```

</details>

<details>
<summary><b>Task Scoring Algorithm</b></summary>

`get_next_task` returns tasks scored by:

| Component  | Max Points | Description                                     |
| ---------- | ---------- | ----------------------------------------------- |
| Dependency | 40         | All dependencies satisfied = 40, else 0         |
| Priority   | 30         | Based on agent number (lower = higher priority) |
| Workload   | 30         | Based on file count (fewer = higher score)      |

**Biases** adjust final scores:

```json
{
  "scoring": {
    "biases": {
      "plans": { "0030-urgent-feature": 20 },
      "personas": { "coder": 5, "reviewer": -10 },
      "statuses": { "GAP": 5, "WIP": -5 }
    }
  }
}
```

</details>

<details>
<summary><b>RLM (Recursive Language Model) Support</b></summary>

`process_doc` and `process_docs` execute JavaScript in a secure QuickJS sandbox. User-provided code is statically validated and cannot use `require`, `import`, `eval`, `fetch`, `XMLHttpRequest`, `WebSocket`, `process`, timers, or other host/network APIs—so it cannot make external calls or access the host.

```typescript
await process_doc({
  path: "plans/0001-feature/plan.md",
  code: `
    const features = extractFeatures(doc.content);
    return features.filter(f => f.status === 'GAP');
  `,
});
```

**Available extractors:**

- `extractSections()` — Markdown headings
- `extractFrontmatter()` — YAML frontmatter
- `extractFeatures()` — Plan features with status
- `extractAgents()` — Agent metadata
- `extractCodeBlocks()` — Fenced code blocks

**LLM sub-queries** (opt-in):

```typescript
await process_doc({
  path: "plans/0001/plan.md",
  code: "extractFeatures(doc.content)",
  sub_query: "Summarize each feature",
  allow_llm: true,
  llm_policy: "force", // or 'auto' (skips small results)
});
```

</details>

<details>
<summary><b>MCP Resources</b></summary>

Progressive disclosure via resources:

| Resource          | Description                  |
| ----------------- | ---------------------------- |
| `plans://index`   | List of all plans (minimal)  |
| `plans://summary` | Plan summaries with key info |
| `plans://full`    | Full plan documents          |
| `decisions://log` | Decision log entries         |

</details>

<details>
<summary><b>Example: Custom Cursor Commands</b></summary>

Create `.cursor/commands/run-agent.md`:

```markdown
# Run Agent

Start work on the next available task.

## Instructions

1. Use `get_next_task` to find the highest-priority task
2. Use `process_doc` to read the agent file
3. Use `update_task_status` to mark it WIP
4. Follow the agent's instructions
```

This integrates with limps MCP tools for seamless task management.

</details>

---

## What is MCP?

**Model Context Protocol** is a standardized protocol for AI applications to connect to external systems. Originally from Anthropic (Nov 2024), now part of the Linux Foundation's Agentic AI Foundation.

- [MCP Specification](https://modelcontextprotocol.io/)
- [MCP Documentation](https://modelcontextprotocol.io/docs)

## License

MIT
