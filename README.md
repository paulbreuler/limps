# limps

**L**ocal **I**ntelligent **M**CP **P**lanning **S**erver — A unified planning layer for AI assistants. No subscriptions, no cloud. Version control your planning docs in git. One shared source of truth across Claude, Cursor, Codex, and any MCP-compatible tool.

[![npm](https://img.shields.io/npm/v/@sudosandwich/limps)](https://www.npmjs.com/package/@sudosandwich/limps)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Tests](https://img.shields.io/badge/Tests-899%20passing-brightgreen)
![Coverage](https://img.shields.io/badge/Coverage-%3E70%25-brightgreen)

![limps in action](https://github.com/paulbreuler/limps/blob/main/.github/assets/limps-in-action.gif?raw=true)

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

That's it. Your AI assistant now has access to your planning documents.

## Why limps?

**The problem:** Each AI assistant maintains its own context. Planning documents, task status, and decisions get fragmented across Claude, Cursor, ChatGPT, and Copilot conversations.

**The solution:** limps provides a standardized MCP interface that any tool can access. Your planning docs live in one place—a git repo you control.

### Supported Clients

| Client | Config Location | Command |
|--------|----------------|---------|
| **Cursor** | `.cursor/mcp.json` (local) | `limps config sync-mcp --client cursor` |
| **Claude Code** | `.mcp.json` (local) | `limps config sync-mcp --client claude-code` |
| **Claude Desktop** | Global config | `limps config sync-mcp --client claude --global` |
| **OpenAI Codex** | `~/.codex/config.toml` | `limps config sync-mcp --client codex --global` |
| **ChatGPT** | Manual setup | `limps config sync-mcp --client chatgpt --print` |

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
      "args": ["-y", "@sudosandwich/limps", "serve", "--config", "/path/to/config.json"]
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

## Configuration

Config location varies by OS:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/limps/config.json` |
| Linux | `~/.config/limps/config.json` |
| Windows | `%APPDATA%\limps\config.json` |

### Config Options

```json
{
  "plansPath": "~/Documents/my-plans",
  "docsPaths": ["~/Documents/my-plans"],
  "fileExtensions": [".md"],
  "dataPath": "~/Library/Application Support/limps/data",
  "extensions": ["@sudosandwich/limps-radix"],
  "scoring": {
    "weights": { "dependency": 40, "priority": 30, "workload": 30 },
    "biases": {}
  }
}
```

| Option | Description |
|--------|-------------|
| `plansPath` | Directory for structured plans (`NNNN-name/` with agents) |
| `docsPaths` | Additional directories to index |
| `fileExtensions` | File types to index (default: `.md`) |
| `dataPath` | SQLite database location |
| `extensions` | Extension packages to load |
| `scoring` | Task prioritization weights and biases |

## MCP Tools

limps exposes 15 MCP tools for AI assistants:

| Category | Tools |
|----------|-------|
| **Documents** | `process_doc`, `process_docs`, `create_doc`, `update_doc`, `delete_doc`, `list_docs`, `search_docs`, `manage_tags`, `open_document_in_cursor` |
| **Plans** | `create_plan`, `list_plans`, `list_agents`, `get_plan_status` |
| **Tasks** | `get_next_task`, `update_task_status` |

## Extensions

Extensions add MCP tools and resources. Install from npm:

```bash
npm install -g @sudosandwich/limps-radix
```

Add to config:

```json
{
  "extensions": ["@sudosandwich/limps-radix"],
  "@sudosandwich/limps-radix": {
    "cacheDir": "~/Library/Application Support/limps-radix"
  }
}
```

**Available extensions:**
- `@sudosandwich/limps-radix` — Radix UI contract extraction and semantic analysis

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
- `packages/limps-radix` — Radix UI extension

## Used in Production

limps manages planning for [runi](https://github.com/paulbreuler/runi), using a [separate git repo](https://github.com/paulbreuler/runi-planning-docs) for version-controlled plans.

---

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

| Component | Max Points | Description |
|-----------|------------|-------------|
| Dependency | 40 | All dependencies satisfied = 40, else 0 |
| Priority | 30 | Based on agent number (lower = higher priority) |
| Workload | 30 | Based on file count (fewer = higher score) |

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

`process_doc` and `process_docs` execute JavaScript in a secure QuickJS sandbox:

```typescript
await process_doc({
  path: 'plans/0001-feature/plan.md',
  code: `
    const features = extractFeatures(doc.content);
    return features.filter(f => f.status === 'GAP');
  `
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
  path: 'plans/0001/plan.md',
  code: 'extractFeatures(doc.content)',
  sub_query: 'Summarize each feature',
  allow_llm: true,
  llm_policy: 'force'  // or 'auto' (skips small results)
});
```
</details>

<details>
<summary><b>MCP Resources</b></summary>

Progressive disclosure via resources:

| Resource | Description |
|----------|-------------|
| `plans://index` | List of all plans (minimal) |
| `plans://summary` | Plan summaries with key info |
| `plans://full` | Full plan documents |
| `decisions://log` | Decision log entries |
| `agents://status` | Agent status and tasks |
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
