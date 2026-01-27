# limps

**L**ocal **I**ntelligent **M**CP **P**lanning **S**erver - limps your Local Intelligent MCP Planning Server across AI assistants. No subscriptions, no cloud—run it locally. Version control your planning docs in git. No more context drift—one shared source of truth for planning docs, tasks, and decisions across Claude Desktop, Cursor, GitHub Copilot, and any MCP tool.

[![npm](https://img.shields.io/npm/v/@sudosandwich/limps)](https://www.npmjs.com/package/@sudosandwich/limps)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Tests](https://img.shields.io/badge/Tests-817%20passing-brightgreen)
![Coverage](https://img.shields.io/badge/Coverage-%3E70%25-brightgreen)

![limps in action](https://github.com/paulbreuler/limps/blob/main/.github/assets/limps-in-action.gif?raw=true)

*Claude Desktop accessing the planning MCP, talking to Runi project docs*

## The Problem limps Solves

**Context drift between LLM providers** — Each AI assistant (Claude, ChatGPT, Cursor, GitHub Copilot, etc.) maintains its own separate context. Without a shared source of truth, planning documents, task status, and decisions get fragmented across different conversations and sessions.

limps solves this by providing a **standardized MCP interface** that any MCP-compatible tool can access. Your planning documents, tasks, and decisions live in one place, accessible to:

- **Claude Desktop** — Full access to search, read, update, create documents, and more
- **Cursor** — Integrated planning and task management via MCP tools
- **GitHub Copilot** — When MCP support is enabled
- **Any MCP-compatible tool** — Standard protocol means universal access

### Deployment Options

- **Local (Default)** — Run limps locally for secure, private access
- **Deployed** — You can deploy the MCP server for global access, but **research AUTH** to protect your endpoint and documents

## Used In Production

limps is actively used to build [runi](https://github.com/paulbreuler/runi) - managing planning documents and task tracking across the development lifecycle.

### How runi Uses limps

The [runi](https://github.com/paulbreuler/runi) project uses a separate git repository ([runi-planning-docs](https://github.com/paulbreuler/runi-planning-docs)) for version-controlled planning documents. Custom Cursor commands in `.cursor/commands/` integrate with limps tools:

**Core Commands:**

| Command | Description | MCP Tools Used |
|---------|-------------|----------------|
| `/create-feature-plan` | Generate TDD plan with docs and agent files | `create_plan`, `create_doc`, `list_docs` |
| `/list-feature-plans` | List all plans with clickable file paths | `list_docs`, `process_doc` |
| `/run-agent` | Start work on next agent task | `process_doc`, `update_task_status` |
| `/close-feature-agent` | Verify completion, sync status | `process_doc`, `update_doc`, `update_task_status` |
| `/update-feature-plan` | Regenerate agents from updated plan | `process_doc`, `create_doc`, `process_docs` |
| `/plan-list-agents` | Show all agents with status | `list_docs`, `process_docs` |

**Example: `/create-feature-plan` using MCP tools:**

```typescript
// 1. Find next plan number
const plans = await list_docs({ path: 'plans/', pattern: '*' });
const nextNum = Math.max(...plans.map(p => parseInt(p.name))) + 1;

// 2. Create plan structure
await create_plan({ name: `${nextNum}-my-feature`, description: '...' });

// 3. Create planning documents
await create_doc({ path: `plans/${nextNum}-my-feature/plan.md`, content: '...' });
await create_doc({ path: `plans/${nextNum}-my-feature/interfaces.md`, content: '...' });
```

**Example: `/run-agent` using process_doc:**

```typescript
// Extract next GAP feature from plan
const nextGap = await process_doc({
  path: `plans/${planName}/plan.md`,
  code: `
    const features = extractFeatures(doc.content);
    const gaps = features.filter(f => f.status === 'GAP');
    return gaps.sort((a, b) => a.priority - b.priority)[0];
  `,
});
```

**Project Structure:**

```
runi/                          # Main codebase
├── .cursor/commands/          # Cursor slash commands
│   ├── create-feature-plan.md
│   ├── list-feature-plans.md
│   ├── run-agent.md
│   ├── close-feature-agent.md
│   └── update-feature-plan.md
└── .claude/commands/          # Claude Code commands
    └── pr.md

runi-planning-docs/            # Separate git repo for plans
├── plans/
│   ├── 0004-datagrid/        # Feature plan
│   │   ├── plan.md           # Full specifications
│   │   ├── interfaces.md     # Interface contracts
│   │   ├── README.md         # Status index
│   │   ├── gotchas.md        # Discovered issues
│   │   └── agents/           # Agent task files
│   └── ...
└── decisions/                 # Decision log
```

## Installation

### Global Install (Recommended)

```bash
npm install -g @sudosandwich/limps
```

### Quick Setup

```bash
limps init my-project --docs-path ~/Documents/my-project
```

This creates a config and outputs the Cursor/Claude Desktop configuration snippets with full paths.

## CLI Commands

limps provides a full CLI for managing projects and viewing plans without needing an MCP client.

```bash
limps --help              # Show all commands
limps <command> --help    # Show command help
```

### Project Management

| Command | Description |
|---------|-------------|
| `limps init <name>` | Initialize a new project |
| `limps serve` | Start the MCP server |

### Plan Commands

| Command | Description |
|---------|-------------|
| `limps list-plans` | List all plans with status |
| `limps list-agents <plan>` | List agents in a plan |
| `limps next-task <plan>` | Get the highest-priority available task |
| `limps status <plan>` | Show plan status summary |

### Configuration

| Command | Description |
|---------|-------------|
| `limps config list` | Show all registered projects |
| `limps config use <name>` | Switch to a different project |
| `limps config show` | Display resolved configuration |
| `limps config path` | Print the config file path |
| `limps config add <name> <path>` | Register an existing config |
| `limps config remove <name>` | Unregister a project |
| `limps config set <path>` | Set current from config path |
| `limps config discover` | Find configs in default locations |
| `limps config update <name>` | Update project paths |
| `limps config add-claude` | Add projects to MCP client configs |

### Multi-Project Workflow

```bash
# Register multiple projects
limps init project-a --docs-path ~/Documents/project-a
limps init project-b --docs-path ~/Documents/project-b

# Switch between projects
limps config use project-a
limps list-plans

limps config use project-b
limps list-plans

# Use environment variable
LIMPS_PROJECT=project-a limps list-plans
```

### Example: Git-based Document Versioning

Point limps at a git repository to version control your planning documents:

```bash
# Create a dedicated docs repo
mkdir ~/Documents/GitHub/my-planning-docs
cd ~/Documents/GitHub/my-planning-docs
git init

# Initialize limps with your docs repo
limps init my-project --docs-path ~/Documents/GitHub/my-planning-docs
```

This approach gives you:
- **Version history** for all plans and decisions
- **Branching** for experimental planning
- **Collaboration** via pull requests
- **Backup** through remote repositories

### Manual Configuration

The server automatically finds configuration at OS-specific locations:

| OS | Config Location |
|----|-----------------|
| macOS | `~/Library/Application Support/limps/config.json` |
| Linux | `~/.config/limps/config.json` |
| Windows | `%APPDATA%\limps\config.json` |

## Configuration

Create a `config.json` at the OS-specific location or specify a path:

```json
{
  "plansPath": "~/Documents/my-plans",
  "docsPaths": ["~/Documents/my-plans"],
  "fileExtensions": [".md"],
  "dataPath": "~/Library/Application Support/limps/data",
  "scoring": {
    "weights": {
      "dependency": 40,
      "priority": 30,
      "workload": 30
    },
    "biases": {}
  }
}
```

### Config Resolution Priority

The server finds configuration in this order:

1. **CLI argument**: `limps serve --config /path/to/config.json`
2. **Environment variable**: `MCP_PLANNING_CONFIG=/path/to/config.json`
3. **Project environment**: `LIMPS_PROJECT=my-project` (looks up in registry)
4. **Registry current project**: Set via `limps config use <name>`
5. **OS-specific default**: See table above

> **Note:** If no config exists at the resolved path, limps auto-creates a default config file.

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `plansPath` | string | `./plans` | Primary directory for structured plans (contains `NNNN-name/` directories with agents, tasks, status tracking) |
| `docsPaths` | string[] | `[]` | Additional directories to index for search (any markdown, no structure required) |
| `fileExtensions` | string[] | `[".md"]` | File types to index |
| `dataPath` | string | `./data` | SQLite database location |
| `scoring` | object | required | Task scoring configuration for `get_next_task` (weights and biases) |

### Path Options

- **Tilde expansion**: `~/Documents/plans` → `/Users/you/Documents/plans`
- **Absolute paths**: `/Users/john/Documents/plans`
- **Relative paths**: `./plans` (relative to config file location)

## MCP Client Setup

> **Important:** MCP clients must use the `serve` subcommand. Run `limps init my-project` first to generate a config.

### Cursor

Add to settings (`Cmd+Shift+P` → "Preferences: Open User Settings (JSON)"):

```json
{
  "mcp.servers": {
    "limps": {
      "command": "limps",
      "args": ["serve", "--config", "/path/to/config.json"]
    }
  }
}
```

### Claude Desktop

Claude Desktop runs in a macOS sandbox—use `npx` instead of global binaries.

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

### Claude Code

Add to `~/.claude/.mcp.json`:

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

### Automatic MCP Client Configuration

Instead of manually editing config files, use the CLI:

```bash
# Add all registered projects to all MCP clients
limps config add-claude

# Add to specific client only
limps config add-claude --client claude
limps config add-claude --client cursor
limps config add-claude --client claude-code

# Add specific projects
limps config add-claude --projects my-project,other-project

# Preview without writing
limps config add-claude --print
```

## Features

### MCP Tools (15 Tools)

#### Document Operations

| Tool | Description |
|------|-------------|
| `process_doc` | Process a document with JavaScript code (read, filter, transform, extract) |
| `process_docs` | Process multiple documents with JavaScript for cross-document analysis |
| `create_doc` | Create new documents |
| `update_doc` | Update with overwrite, append, or prepend modes |
| `delete_doc` | Delete documents |
| `list_docs` | List files and directories |
| `search_docs` | Full-text search with frontmatter support, excerpts, and match counts |
| `manage_tags` | Add, remove, or list tags (frontmatter and inline `#tag` format) |
| `open_document_in_cursor` | Open files in Cursor editor |

#### Plan Management

| Tool | Description |
|------|-------------|
| `create_plan` | Create feature plans with directory structure and agent files |
| `list_plans` | List all plans with status, workType, and overview |
| `list_agents` | List agents for a plan with status, persona, and file counts |
| `get_plan_status` | Get plan progress with completion %, blocked/WIP agents |

#### Task Management

| Tool | Description |
|------|-------------|
| `get_next_task` | Get highest-priority task with detailed score breakdown |
| `update_task_status` | Update task status (GAP → WIP → PASS/BLOCKED) |

#### Task Scoring Algorithm

When using `get_next_task` with a `planId`, returns a detailed score breakdown:

| Score Component | Max Points | Description |
|----------------|------------|-------------|
| Dependency Score | 40 | All dependencies satisfied = 40, otherwise 0 |
| Priority Score | 30 | Based on agent number (lower = higher priority) |
| Workload Score | 30 | Based on file count (fewer files = higher score) |
| **Total** | **100** | Sum of all components |

Example response:
```json
{
  "taskId": "0001-feature#002",
  "title": "Implement API endpoints",
  "totalScore": 85,
  "dependencyScore": 40,
  "priorityScore": 24,
  "workloadScore": 21,
  "reasons": ["All 2 dependencies satisfied", "Agent #2 priority: 24/30", "3 files to modify: 21/30"],
  "otherAvailableTasks": 3
}
```

#### Scoring Biases

Biases are numeric adjustments added to the final score. Use them to promote or demote specific plans, personas, or statuses.

Supported bias keys:

| Bias Key | Description | Example |
|---------|-------------|---------|
| `plans` | Per-plan bias keyed by plan folder name | `"plans": { "0030-limps-scoring-weights": 20 }` |
| `personas.coder` | Bias for coder tasks | `"personas": { "coder": 10 }` |
| `personas.reviewer` | Bias for reviewer tasks | `"personas": { "reviewer": -10 }` |
| `personas.pm` | Bias for PM tasks | `"personas": { "pm": 5 }` |
| `personas.customer` | Bias for customer tasks | `"personas": { "customer": 5 }` |
| `statuses.GAP` | Bias for GAP tasks | `"statuses": { "GAP": 5 }` |
| `statuses.WIP` | Bias for WIP tasks | `"statuses": { "WIP": -5 }` |
| `statuses.BLOCKED` | Bias for BLOCKED tasks | `"statuses": { "BLOCKED": 10 }` |

Example:
```json
{
  "scoring": {
    "weights": {
      "dependency": 40,
      "priority": 30,
      "workload": 30
    },
    "biases": {
      "plans": { "0030-limps-scoring-weights": 20 },
      "personas": { "reviewer": -10, "coder": 5 },
      "statuses": { "GAP": 5 }
    }
  }
}
```

### RLM (Recursive Language Model) Support

Implements the [RLM pattern from MIT CSAIL](https://arxiv.org/abs/2512.24601) for programmatic document examination and recursive processing:

- **Sandbox execution** - Secure JavaScript via QuickJS
- **Recursive sub-calls** - Depth-limited processing
- **Parallel execution** - Cross-document analysis
- **Document extractors** - Markdown, YAML, Gherkin parsing

#### Sub-query LLM Gating

`process_doc` and `process_docs` only invoke LLM sub-queries when explicitly enabled. This keeps local workflows deterministic by default and avoids token spend unless requested.

- **Opt-in:** `allow_llm: true` is required to run `sub_query`
- **Policy:** `llm_policy: "auto"` (default) skips small results (under 800 bytes); `"force"` always runs
- **Skip metadata:** when skipped, responses include `sub_query_skipped` and `sub_query_reason`

Example:
```typescript
await process_doc({
  path: 'plans/0001-feature/plan.md',
  code: 'extractFeatures(doc.content)',
  sub_query: 'Summarize each feature',
  allow_llm: true,
  llm_policy: 'force'
});
```

### Obsidian Vault Compatibility

limps is compatible with Obsidian vaults. Simply open your `plans/` directory as an Obsidian vault to get a visual editor for your planning documents:

![Obsidian vault with limps plans](https://github.com/paulbreuler/limps/blob/main/.github/assets/obsidian-vault.png?raw=true)

**Features:**
- **Frontmatter parsing** - Full YAML frontmatter support via `gray-matter`
- **Tag management** - Both frontmatter `tags:` arrays and inline `#tag` format
- **Path filtering** - Automatically excludes `.obsidian/`, `.git/`, `node_modules/`
- **Frontmatter search** - Search within YAML properties with `searchFrontmatter: true`

> **Tip:** The `.obsidian/` folder is automatically excluded from indexing and should be added to `.gitignore` to keep local settings out of version control.

#### Enhanced Search Features

```typescript
// Search with frontmatter and excerpts
await search_docs({
  query: 'status PASS',
  searchFrontmatter: true,  // Search in YAML frontmatter
  searchContent: true,       // Search in body content
  caseSensitive: false,      // Case-insensitive (default)
  prettyPrint: true          // Human-readable output
});

// Returns: path, title, excerpt (with context), matchCount, lineNumber
```

#### Write Modes for update_doc

```typescript
// Append content (preserves existing, merges frontmatter)
await update_doc({
  path: 'notes/meeting.md',
  content: '\n## Action Items\n- Task 1',
  mode: 'append'
});

// Prepend content
await update_doc({
  path: 'notes/log.md',
  content: '## 2024-01-26\nNew entry\n',
  mode: 'prepend'
});
```

#### Tag Management

```typescript
// List all tags (frontmatter + inline #tags)
await manage_tags({ path: 'notes/project.md', operation: 'list' });

// Add tags to frontmatter
await manage_tags({ path: 'notes/project.md', operation: 'add', tags: ['active', 'priority'] });

// Remove tags
await manage_tags({ path: 'notes/project.md', operation: 'remove', tags: ['draft'] });
```

### Resources (Progressive Disclosure)

- `plans://index` — List of all plans (minimal)
- `plans://summary` — Plan summaries (key info)
- `plans://full` — Full plan documents
- `decisions://log` — Decision log entries
- `agents://status` — Agent status and tasks

## Development

```bash
git clone https://github.com/paulbreuler/limps.git
cd limps
npm install       # Install dependencies
npm run build     # Build TypeScript
npm test          # Run tests
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

![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![Ink](https://img.shields.io/badge/Ink-6-green)
![SQLite](https://img.shields.io/badge/SQLite-FTS5-003B57)
![Zod](https://img.shields.io/badge/Zod-4-3068b7)

- Full-text search with auto-indexing and frontmatter support
- Real-time file watching (Chokidar) with path filtering
- RLM sandbox (QuickJS)
- Obsidian-compatible frontmatter (gray-matter)

### Principles

1. Simplicity over complexity
2. Local-first, no external dependencies
3. Progressive disclosure (index → summary → full)
4. Optimistic concurrency
5. Scoring-based task selection

## Adapting for Other Uses

The server is designed for planning documents but the core is generic. For wikis or knowledge bases: configure `plansPath`/`docsPaths`/`fileExtensions` to point at your content, and optionally customize extractors in `src/rlm/extractors.ts`.

## What is MCP?

**MCP (Model Context Protocol)** is a standardized protocol for AI applications to connect to external systems. Launched by Anthropic (Nov 2024), now part of the Linux Foundation's Agentic AI Foundation.

- [MCP Specification](https://modelcontextprotocol.io/)
- [MCP Documentation](https://modelcontextprotocol.io/docs)

## License

MIT
