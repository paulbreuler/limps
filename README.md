# MCP Planning Server

MCP server for managing planning documents, agent coordination, and task tracking.

## What is MCP?

**MCP (Model Context Protocol)** is a standardized protocol that enables AI applications to securely connect to external systems and data sources. Think of it as "USB-C for AI" — a universal connector that allows AI models to:

- Access tools and APIs
- Read and write data
- Execute operations in external systems
- Maintain context across conversations

MCP was launched by Anthropic in November 2024 and donated to the Linux Foundation's Agentic AI Foundation in December 2025. It uses JSON-RPC over stdio or HTTP transports, allowing servers (like this one) to expose capabilities that AI clients (like Cursor or Claude Desktop) can use.

**Learn more:**
- [MCP Specification](https://modelcontextprotocol.io/)
- [MCP Documentation](https://modelcontextprotocol.io/docs)

## Purpose

This MCP server enables AI agents (like Claude in Cursor) to:

1. **Manage planning documents** — Read, create, update, and delete markdown documents in a structured repository
2. **Coordinate multi-agent workflows** — Track task assignments, agent status, and handoffs between AI agents
3. **Query documents intelligently** — Use RLM (Recursive Language Model) queries to extract and process information from large documents before sending to the LLM
4. **Search and navigate** — Full-text search across documents with progressive disclosure (index → summary → full)

**Intended Use Cases:**
- AI-assisted planning and documentation workflows
- Multi-agent task coordination (planner/worker patterns)
- Large document comprehension with RLM filtering
- Structured knowledge base management

## Features & Functionality

### Document Management (14 Tools)

**CRUD Operations:**
- `read_doc` — Read full document content
- `create_doc` — Create new documents
- `update_doc` — Update existing documents with optimistic concurrency
- `delete_doc` — Delete documents
- `list_docs` — List files and directories

**Search & Discovery:**
- `search_docs` — Full-text search using SQLite FTS5
- `rlm_query` — Execute JavaScript code on single documents (filter/transform before LLM processing)
- `rlm_multi_query` — Cross-document analysis with glob patterns

**Planning & Coordination:**
- `create_plan` — Create feature plans with directory structure
- `update_task_status` — Update task status (GAP → WIP → PASS/BLOCKED)
- `claim_task` — Claim tasks with file locks
- `release_task` — Release tasks and locks
- `get_next_task` — Get highest-priority available task based on dependencies

**Integration:**
- `open_document_in_cursor` — Open files in Cursor editor at specific line/column

### Resources (Progressive Disclosure)

Three-tier resource hierarchy to minimize context while maximizing effectiveness:

- `plans://index` — List of all plans (minimal metadata)
- `plans://summary` — Summaries of plans (key information)
- `plans://full` — Full plan documents (complete content)
- `decisions://log` — Decision log entries
- `agents://status` — Current agent status and active tasks

### Core Infrastructure

- **SQLite + FTS5** — Full-text search index with automatic updates
- **File Watching** — Real-time indexing on file changes (Chokidar with debouncing)
- **Multi-Agent Coordination** — File-based coordination with heartbeat tracking
- **RLM Sandbox** — Secure JavaScript execution environment (QuickJS) for document queries

## Is This Specific to a Particular Project?

**Short answer:** The server is designed for planning document management, but the architecture is **generic and adaptable** to other document management use cases.

**What's planning-specific:**
- Default paths and directory structure (`plans/`, etc.)
- Planning document schemas (feature plans, agent files, TDD structure)
- Task coordination patterns (planner/worker handoffs)

**What's generic:**
- Document CRUD operations (works with any markdown files)
- Full-text search (SQLite FTS5 is content-agnostic)
- File watching (watches any configured directories)
- RLM query system (works with any document structure)
- Multi-agent coordination (file-based, protocol-agnostic)

## Adapting for Other Solutions

### Option 1: Configuration-Only Adaptation

For similar document management needs, you can adapt via configuration:

1. **Update `config.json`:**
   ```json
   {
     "plansPath": "./your-docs",
     "docsPaths": ["./content", "./docs"],
     "fileExtensions": [".md", ".txt", ".rst"]
   }
   ```

2. **Customize tool descriptions** in `src/tools/index.ts` to match your domain

3. **Adjust resource schemas** in `src/resources/` if needed

### Option 2: Domain-Specific Customization

For different use cases (e.g., code documentation, knowledge bases, wikis):

1. **Replace planning-specific tools:**
   - Remove `create_plan`, `update_task_status` if not needed
   - Add domain-specific tools (e.g., `create_article`, `tag_document`)

2. **Customize document schemas:**
   - Modify extractors in `src/rlm/extractors.ts` for your document format
   - Update helpers in `src/rlm/helpers.ts` for your metadata needs

3. **Adjust coordination layer:**
   - Modify `src/coordination.ts` for different agent patterns
   - Or remove coordination entirely if single-agent use

### Option 3: Framework Extraction

The server follows clean architecture principles:

- **Core:** `indexer.ts`, `watcher.ts`, `server.ts` (reusable)
- **Domain:** `tools/`, `resources/` (customizable)
- **Infrastructure:** SQLite, Chokidar, QuickJS (swappable)

You could extract the core into a framework and build domain-specific servers on top.

### Migration Checklist

If adapting to a new domain:

- [ ] Update `config.json` paths and file extensions
- [ ] Review and customize tool descriptions
- [ ] Modify or remove planning-specific tools
- [ ] Update resource schemas if needed
- [ ] Adjust document extractors for your format
- [ ] Customize coordination patterns (or remove)
- [ ] Update tests for your domain
- [ ] Adjust RLM helpers for your document structure

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Watch mode
npm run dev
```

## Configuration

Configuration is stored in `config.json` at the project root:

```json
{
  "plansPath": "./plans",
  "docsPaths": ["."],
  "fileExtensions": [".md"],
  "dataPath": "./data",
  "coordinationPath": "./data/coordination.json",
  "heartbeatTimeout": 300000,
  "debounceDelay": 200,
  "maxHandoffIterations": 3
}
```

See `config.json.example` for a template configuration file.

## Database

The server uses SQLite with FTS5 for full-text search. Database files are stored in `data/` (git-ignored).

## Architecture Principles

1. **Simplicity over complexity** — Remove complexity rather than add it
2. **Local-first** — File-based coordination, no external dependencies
3. **Progressive disclosure** — Three-tier resource hierarchy (index → summary → full)
4. **Planner/worker separation** — Explicit handoff contracts, not peer-to-peer
5. **Optimistic concurrency** — Read freely, fail writes on state change
6. **Scoring-based selection** — Dependencies, priority, agent fit, file conflicts

## Installation

See [INSTALLATION.md](./INSTALLATION.md) for complete installation and configuration instructions.

**Quick Start:**

1. Clone the repository
2. Run `npm install && npm run build`
3. Edit `config.json` to point to your planning documents directory
4. Configure Cursor (see [SETUP_CURSOR.md](./SETUP_CURSOR.md))

## Verification

Run the verification script to check tool registration:

```bash
npx tsx scripts/verify-tools.ts
```

This confirms all 14 tools are properly registered and available.
