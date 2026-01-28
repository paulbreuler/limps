# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

This is an npm workspaces monorepo with two packages:

- `packages/limps` - @sudosandwich/limps - The main MCP planning server
- `packages/limps-radix` - @sudosandwich/limps-radix - Radix UI extension for limps

## Build and Development Commands

```bash
# Root-level commands (run across all workspaces)
npm run build          # Compile TypeScript to dist/ in all packages
npm test               # Run all tests across workspaces
npm run lint           # ESLint check across workspaces
npm run validate       # Full validation: format + lint + type-check + build + test

# Single package commands
npm run build -w packages/limps           # Build only limps
npm run test -w packages/limps            # Test only limps
npm run build -w packages/limps-radix     # Build only limps-radix

# Development
npm run dev -w packages/limps             # Watch mode for limps
```

### Running a Single Test

```bash
cd packages/limps
npx vitest run tests/path/to/file.test.ts
npx vitest run -t "test name pattern"
```

## Architecture Overview

limps is an MCP (Model Context Protocol) server for AI agent plan management. It provides tools and resources that AI assistants (Claude Desktop, Cursor, etc.) can use to manage planning documents and tasks.

### Core Components (packages/limps)

**Entry Points:**

- `src/cli.tsx` - Pastel-based CLI entry point (main user interface)
- `src/index.ts` - Direct server invocation for backwards compatibility
- `src/server-main.ts` - Server initialization with config loading, database setup, and file watcher

**MCP Layer:**

- `src/server.ts` - Creates MCP server instance with `@modelcontextprotocol/sdk`
- `src/tools/index.ts` - Registers 14 MCP tools (document CRUD, plan management, task status)
- `src/resources/index.ts` - Registers 5 MCP resources (plans://index, plans://summary/*, plans://full/*, decisions://log, agents://status)

**Extension System:**

- `src/extensions/types.ts` - LimpsExtension interface for building extensions
- `src/extensions/loader.ts` - Dynamic extension loading from config
- `src/extensions/context.ts` - ExtensionContext provided to extensions

**Data Layer:**

- `src/indexer.ts` - SQLite database with FTS5 for full-text search; indexes markdown files with frontmatter parsing
- `src/watcher.ts` - Chokidar file watcher for real-time index updates
- `src/config.ts` - Configuration loading with tilde expansion and path resolution

**RLM (Recursive Language Model) Sandbox:**

- `src/rlm/` - QuickJS-based JavaScript sandbox for safe document processing
- Key exports: `createEnvironment`, `validateCode`, helper functions for extracting sections, frontmatter, features, agents
- Used by `process_doc` and `process_docs` tools for programmatic document analysis

**CLI Commands:**

- `src/commands/` - Pastel/Ink React components for CLI subcommands
- `src/components/` - Shared React components for CLI output formatting

### Key Patterns

**Tool/Resource Context:** Both tools and resources receive a context object containing the database instance and server config. The context is attached to the server instance.

**Document Processing:** The `process_doc` and `process_docs` tools execute user-provided JavaScript in a QuickJS sandbox with helper functions for extracting structured data from markdown.

**Task IDs:** Format is `{planNumber}-{planName}#{agentNumber}` (e.g., `0001-feature-auth#002`). The agent parser in `src/agent-parser.ts` extracts metadata from agent files.

**Task Status:** Agent frontmatter is the source of truth for task status (GAP, WIP, PASS, BLOCKED). Use `update_task_status` tool to modify status.

**Plan Structure:** Plans live in `config.plansPath` with structure:

```text
plans/
  0001-feature-name/
    0001-feature-name-plan.md           # Main plan with overview
    interfaces.md     # Interface contracts
    README.md         # Status index
    agents/           # Agent task files (000-title.md, 001-title.md)
```

### Test Organization

Tests mirror the source structure in `packages/limps/tests/`. Tests run sequentially (`fileParallelism: false`) to avoid SQLite locking issues. Coverage threshold is 70% for all metrics.
