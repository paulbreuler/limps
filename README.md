# limps

**L**ocal **I**ntelligent **M**CP **P**lanning **S**erver — A document and planning layer for AI assistants. No subscriptions, no cloud. Point limps at **any folder** (local, synced, or in git). One shared source of truth across Claude, Cursor, Codex, and any MCP-compatible tool.

[![npm](https://img.shields.io/npm/v/@sudosandwich/limps)](https://www.npmjs.com/package/@sudosandwich/limps)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Tests](https://img.shields.io/badge/Tests-1167%20passing-brightgreen)
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
- [Project Setup](#project-setup)
- [Client Setup](#client-setup)
- [Transport](#transport)
- [CLI Commands](#cli-commands)
- [Configuration](#configuration)
- [Environment Variables](#environment-variables)
- [MCP Tools](#mcp-tools)
- [Skills & Commands](#skills--commands)
- [Extensions](#extensions)
- [Obsidian Compatibility](#obsidian-compatibility)
- [Development](#development)
- [Used in Production](#used-in-production)
- [Creating a feature plan](#creating-a-feature-plan)
- [Deep Dive](#deep-dive)
- [Instructions](#instructions)
- [What is MCP?](#what-is-mcp)
- [License](#license)

## Quick Start

```bash
# Install globally
npm install -g @sudosandwich/limps

# Initialize a project
limps init my-project --docs-path ~/Documents/my-planning-docs

# Add to your AI assistant (picks up all registered projects)
limps config sync-mcp --client cursor
limps config sync-mcp --client claude-code
```

Run this in the folder where you want to keep the docs and that's it. Your AI assistant now has access to your documents and nothing else. The folder can be anywhere—local, synced, or in a repo; limps does not require a git repository or a `plans/` directory.

## Features

- **Document CRUD + full-text search** across any folder of Markdown files
- **Plan + agent workflows** with status tracking and task scoring
- **Next-task suggestions** with score breakdowns and bias tuning
- **Sandboxed document processing** via `process_doc(s)` helpers
- **Multi-client sync** for Cursor, Claude, Codex, and more
- **Extensions** for domain-specific tooling (e.g., limps-headless)
- **Knowledge graph** — Entity extraction, hybrid retrieval, conflict detection, and graph-based suggestions
- **Health automation** — Staleness detection, code drift checks, status inference, and auto-fix proposals
- **Advanced task scoring** — Dependency-aware prioritization with per-plan/agent weight overrides
- **MCP Registry** — Published to the official MCP Registry (`registry.modelcontextprotocol.io`)

### What to know before you start

- **Local only** — Your data stays on disk (SQLite index + your files). No cloud, no subscription.
- **Restart after changes** — If you change the indexed folder or config, restart the MCP server (or rely on the file watcher) so the index and tools reflect the current state.
- **Sandboxed user code** — `process_doc` and `process_docs` run your JavaScript in a QuickJS sandbox with time and memory limits; no network or Node APIs.
- **One optional network call** — `limps version --check` fetches from the npm registry to compare versions. All other commands (serve, init, list, search, create/update/delete docs, process_doc, etc.) do **not** contact the internet. Omit `version --check` if you want zero external calls.

## How I Use limps

I use `limps` as a local planning layer across multiple AI tools, focused on **create → read → update → closure** for plans and tasks. The MCP server points at whatever directory I want (not necessarily a git repo), so any client reads and updates the same source of truth.

Typical flow:

1. Point limps at a docs directory (any folder, local or synced).
2. Use CLI + MCP tools to create plans/docs, read the current status, update tasks, and close work when done.
3. Sync MCP configs so Cursor/Claude/Codex all see the same plans.

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
- **Multi-project**: Register multiple folders and switch with `limps config use`.
- **Shared team folder**: Put plans in a shared location and review changes like code.
- **Local-first**: Keep everything on disk, no hosted service required.

Key ideas:

- **Any folder** — You choose the path; if there’s no `plans/` subdir, the whole directory is indexed. Use generic tools (`list_docs`, `search_docs`, `create_doc`, `update_doc`, `delete_doc`, `process_doc`, `process_docs`) or plan-specific ones (`create_plan`, `list_plans`, `list_agents`, `get_plan_status`, `update_task_status`, `get_next_task`).
- **One source of truth** — MCP tools give structured access; multiple clients share the same docs.

## Why limps?

**The problem:** Each AI assistant maintains its own context. Planning documents, task status, and decisions get fragmented across Claude, Cursor, ChatGPT, and Copilot conversations.

**The solution:** limps provides a standardized MCP interface that any tool can access. Your docs live in one place—a folder you choose. Use git (or any sync) if you want version control; limps is not tied to a repository.

### Supported Clients

| Client             | Config Location            | Command                                          |
| ------------------ | -------------------------- | ------------------------------------------------ |
| **Cursor**         | `.cursor/mcp.json` (local) | `limps config sync-mcp --client cursor`          |
| **Claude Code**    | `.mcp.json` (local)        | `limps config sync-mcp --client claude-code`     |
| **Claude Desktop** | Global config              | `limps config sync-mcp --client claude --global` |
| **OpenAI Codex**   | `~/.codex/config.toml`     | `limps config sync-mcp --client codex --global`  |
| **ChatGPT**        | Manual setup               | `limps config sync-mcp --client chatgpt --print` |

> **Note:** By default, `sync-mcp` writes to local/project configs. Use `--global` for user-level configs.

## Installation

```bash
npm install -g @sudosandwich/limps
```

## Project Setup

### Initialize a New Project

```bash
limps init my-project --docs-path ~/Documents/my-planning-docs
```

This creates a config file and outputs setup instructions.

### Register an Existing Directory

```bash
limps config add my-project ~/Documents/existing-docs
```

If the directory contains a `plans/` subdirectory, limps uses it. Otherwise, it indexes the entire directory.

### Multiple Projects

```bash
# Register multiple projects
limps init project-a --docs-path ~/docs/project-a
limps init project-b --docs-path ~/docs/project-b

# Switch between them
limps config use project-a

# Or use environment variable
LIMPS_PROJECT=project-b limps list-plans
```

## Client Setup

### Automatic (Recommended)

```bash
# Add all projects to a client's local config
limps config sync-mcp --client cursor

# Preview changes without writing
limps config sync-mcp --client cursor --print

# Write to global config instead of local
limps config sync-mcp --client cursor --global

# Custom config path
limps config sync-mcp --client cursor --path ./custom-mcp.json
```

### Manual Setup

<details>
<summary><b>Cursor</b></summary>

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "limps": {
      "command": "limps",
      "args": ["serve", "--config", "/path/to/config.json"]
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
    "limps": {
      "command": "limps",
      "args": ["serve", "--config", "/path/to/config.json"]
    }
  }
}
```

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Claude Desktop runs in a sandbox—use `npx` instead of global binaries.

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "limps": {
      "command": "npx",
      "args": [
        "-y",
        "@sudosandwich/limps",
        "serve",
        "--config",
        "/path/to/config.json"
      ]
    }
  }
}
```

</details>

<details>
<summary><b>Windows (npx)</b></summary>

On Windows, use `cmd /c` to run `npx`:

```json
{
  "mcpServers": {
    "limps": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "@sudosandwich/limps",
        "serve",
        "--config",
        "C:\\path\\to\\config.json"
      ]
    }
  }
}
```

</details>

<details>
<summary><b>OpenAI Codex</b></summary>

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.limps]
command = "limps"
args = ["serve", "--config", "/path/to/config.json"]
```

</details>

<details>
<summary><b>ChatGPT</b></summary>

ChatGPT requires a remote MCP server over HTTPS. Deploy limps behind an MCP-compatible HTTP/SSE proxy.

In ChatGPT → Settings → Connectors → Add custom connector:

- **Server URL**: `https://your-domain.example/mcp`
- **Authentication**: Configure as needed

Print setup instructions:

```bash
limps config sync-mcp --client chatgpt --print
```

</details>

## Transport

- **Current**: stdio (local MCP server, launched by your client).
- **Remote clients**: Use an MCP-compatible proxy for HTTPS clients (e.g., ChatGPT).
- **Roadmap**: SSE/HTTP transports are planned but not implemented yet.

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
limps init <name>             # Initialize new project
limps serve                   # Start MCP server
limps config list             # Show registered projects
limps config use <name>       # Switch active project
limps config show             # Display current config
limps config sync-mcp         # Add projects to MCP clients
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

Config location varies by OS:

| OS      | Path                                              |
| ------- | ------------------------------------------------- |
| macOS   | `~/Library/Application Support/limps/config.json` |
| Linux   | `~/.config/limps/config.json`                     |
| Windows | `%APPDATA%\limps\config.json`                     |

### Config Options

```json
{
  "plansPath": "~/Documents/my-plans",
  "docsPaths": ["~/Documents/my-plans"],
  "fileExtensions": [".md"],
  "dataPath": "~/Library/Application Support/limps/data",
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
| `graph`          | Knowledge graph settings (e.g., entity extraction options) |
| `retrieval`      | Search recipe configuration for hybrid retrieval           |

## Environment Variables

| Variable               | Description                                                | Example                                           |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| `LIMPS_PROJECT`        | Select active project for CLI commands                     | `LIMPS_PROJECT=project-b limps list-plans`        |
| `LIMPS_ALLOWED_TOOLS`  | Comma-separated allowlist; only these tools are registered | `LIMPS_ALLOWED_TOOLS="list_docs,search_docs"`     |
| `LIMPS_DISABLED_TOOLS` | Comma-separated denylist; tools to hide                    | `LIMPS_DISABLED_TOOLS="process_doc,process_docs"` |

**Precedence:** `config.tools` overrides env vars. If allowlist is set, denylist is ignored.

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

| Command                | Description                         |
| ---------------------- | ----------------------------------- |
| `/create-feature-plan` | Create a full TDD plan with agents  |
| `/run-agent`           | Pick up and execute the next agent  |
| `/close-feature-agent` | Mark an agent PASS and clean up     |
| `/update-feature-plan` | Revise an existing plan             |
| `/audit-plan`          | Audit a plan for completeness       |
| `/list-feature-plans`  | List all plans with status          |
| `/plan-check-status`   | Check plan progress                 |
| `/pr-create`           | Create a PR from the current branch |

**Vercel Skills** (for other AI IDEs):

```bash
npx skills add paulbreuler/limps/skills/limps-planning
```

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
