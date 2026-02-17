# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

This is an npm workspaces monorepo with two packages:

- `packages/limps` - @sudosandwich/limps - The main MCP planning server
- `packages/limps-headless` - @sudosandwich/limps-headless - Headless UI extension for limps

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
npm run build -w packages/limps-headless # Build only limps-headless

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
- `src/index.ts` - Direct server invocation for backwards compatibility (stdio transport)
- `src/server-main.ts` - Server initialization with config loading, database setup, and file watcher
- `src/server-http.ts` - HTTP daemon server using `StreamableHTTPServerTransport`
- `src/commands/serve.tsx` - stdio-to-HTTP bridge for Claude Desktop/Cursor (uses `StreamableHTTPClientTransport`)

**MCP Layer:**

- `src/server.ts` - Creates MCP server instance with `@modelcontextprotocol/sdk`
- `src/tools/index.ts` - Registers 14 MCP tools (document CRUD, plan management, task status)
- `src/resources/index.ts` - Registers 4 MCP resources (plans://index, plans://summary/*, plans://full/*, decisions://log)

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
  - `serve.tsx` - stdio-to-HTTP bridge (ensures daemon running, connects via HTTP client transport)
  - `start.tsx` - HTTP daemon management (spawns/manages daemon process)
  - `stop.tsx` - Stop HTTP daemon
  - `server-status.tsx` - Show daemon status and sessions
- `src/components/` - Shared React components for CLI output formatting

**HTTP Daemon Architecture:**

limps supports both stdio and HTTP transports:

1. **stdio mode** (`limps` or `limps server`) - Direct stdio transport, used by MCP clients that spawn servers
2. **HTTP daemon mode** (`limps start`) - Persistent HTTP server, shared across multiple clients
3. **Bridge mode** (`limps serve`) - stdio-to-HTTP proxy for Claude Desktop/Cursor

Bridge architecture (recommended for Claude Desktop/Cursor):
```
Claude Desktop → stdio → limps serve (bridge) → HTTP → shared daemon
Cursor → stdio → limps serve (bridge) → HTTP → same daemon
Claude Code → HTTP directly → same daemon
```

Benefits: One daemon process shared by all clients, resource-efficient, consistent behavior.

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

## Development Workflow: Test-Driven Development (TDD)

Always follow test-driven development principles when working on this codebase:

### 1. Write Tests First
- Create test cases that describe the expected behavior
- Tests should clearly document what the code should do
- Use descriptive test names: `it('should return correct totalAgents count for PASS plans')`

### 2. Run Tests and Watch Them Fail
```bash
npm test -w packages/limps         # Run all tests
npm run test:watch -w packages/limps  # Watch mode for TDD
npx vitest run -t "test pattern"   # Run specific test
```

### 3. Write Implementation Code
- Write minimal code to pass the tests
- Don't over-engineer; focus on passing tests
- Run tests frequently to validate changes

### 4. Refactor
- Once tests pass, improve code quality
- Ensure tests still pass after refactoring
- Remove duplication and improve clarity

### Example TDD Workflow

```bash
# 1. Create test file (e.g., packages/limps/tests/cli/tdd-issues.test.ts)
# 2. Write test cases describing the fix

# 3. Run tests (they will fail)
npm run test:watch -w packages/limps

# 4. Implement code to fix failing tests
# (e.g., fix getPlanStatusSummary to return totalAgents correctly)

# 5. Verify all tests pass
npm test -w packages/limps

# 6. Refactor if needed while keeping tests passing
```

## Code Style and Idioms

### Naming Conventions
- Use descriptive names that match business logic
- Functions: `getPlanStatusSummary()`, `renderPlanStatusCards()`
- Tests: `it('should return correct totalAgents for PASS plans')`
- Private methods: `_formatOutput()` or `private renderCards()`

### Error Handling
- Always wrap CLI operations in try-catch
- Return `{ ok: false, error: string }` for errors
- Use `CommandExecResult<T>` interface for CLI wrapper results
- Provide context-specific error messages

### JSON Output
All CLI commands with `--json` flag must:
```typescript
return {
  success: true,
  data: { /* actual data */ }
};
// or
return {
  success: false,
  error: "Description",
  code?: "ERROR_CODE"
};
```

### TypeScript Best Practices
- Export interfaces for public APIs
- Use strict typing (no `any` except in rare cases)
- Type generic functions: `function run<T>(options: T): Promise<Result<T>>`
- Use discriminated unions for result types

### Testing Best Practices
- Each test file mirrors one source file (e.g., `src/cli/status.ts` → `tests/cli/status.test.ts`)
- Setup/teardown with `beforeEach` / `afterEach`
- Arrange-Act-Assert pattern in tests
- Shared test utilities in `tests/` root directory
- Mock external dependencies using vitest

