---
name: Persistent HTTP Server
status: GAP
work_type: overhaul
tags: [server, transport, http, breaking-change, v3]
---

# 0049: Persistent HTTP Server

## Overview

Each MCP client (Claude Desktop, Cursor, Claude Code) currently spawns its own `limps serve` process. Each process creates its own SQLite DB connection and `@parcel/watcher` file watcher. With N terminals = N file watchers = file descriptor exhaustion.

**Solution**: Single persistent HTTP server process. Multiple clients connect via `StreamableHTTPServerTransport` (MCP SDK v1.25+). One DB, one watcher, many sessions.

**This is a v3 breaking change**: `limps serve` (stdio) is replaced by `limps start` / `limps stop` (HTTP daemon).

```
Before:  Client A --stdio--> [limps serve] (DB + watcher)
         Client B --stdio--> [limps serve] (DB + watcher)  ← duplicate!
         Client C --stdio--> [limps serve] (DB + watcher)  ← duplicate!

After:   Client A --HTTP-->  |                                      |
         Client B --HTTP-->  | [limps start] persistent server      |
         Client C --HTTP-->  | (1 DB + 1 watcher + N sessions)      |
```

---

## Feature #1: Extract shared initialization

**Status**: `GAP`

### Gherkin

```gherkin
Given server-main.ts contains initialization logic (config, DB, watcher)
When both stdio and HTTP modes need the same setup
Then extract into a shared module that both can call
And the existing startMcpServer still works identically
```

### Current State

`server-main.ts` lines 39-179 contain all init logic:
1. Resolve config path (line 60)
2. Load config (line 63)
3. Create data dir (line 66)
4. Init SQLite + FTS5 schema (lines 69-72)
5. Validate paths, index documents (lines 75-120)
6. Check FD budget (lines 123-131)
7. Start @parcel/watcher (lines 137-162)

All of this is reusable. Only the last step (create McpServer + connect stdio transport) is mode-specific.

### Design

Create `server-shared.ts`:

```typescript
export interface SharedResources {
  config: ServerConfig;
  db: DatabaseType;
  watcher: LimpsWatcher | null;
  loadedExtensions: LoadedExtension[];
}

export async function initializeSharedResources(
  configPathArg?: string
): Promise<SharedResources>

export async function cleanupSharedResources(
  resources: SharedResources
): Promise<void>
```

Refactor `server-main.ts` to:
```typescript
export async function startMcpServer(configPathArg?: string): Promise<void> {
  const shared = await initializeSharedResources(configPathArg);
  const server = await createServer(shared.config, shared.db, shared.loadedExtensions);
  await startServer(server, () => cleanupSharedResources(shared));
}
```

### TDD Cycles

1. **Test: initializeSharedResources returns valid resources** → create temp config, call init, assert db/config/watcher returned → cleanup
2. **Test: cleanupSharedResources closes everything** → init, cleanup, assert db closed and watcher stopped
3. **Test: startMcpServer regression** → existing tests pass unchanged

### Files

- `src/server-shared.ts` (CREATE)
- `src/server-main.ts` (MODIFY)

---

## Feature #2: Server config fields

**Status**: `GAP`

### Gherkin

```gherkin
Given a limps config JSON
When the user adds a server section with port and host
Then loadConfig validates and returns the server settings
And defaults are applied when server section is absent
```

### Design

Add to `ServerConfig` in `config.ts`:

```typescript
server?: {
  port?: number;    // default: 4269
  host?: string;    // default: '127.0.0.1'
};

export const DEFAULT_SERVER_PORT = 4269;
export const DEFAULT_SERVER_HOST = '127.0.0.1';
export function getServerPort(config: ServerConfig): number;
export function getServerHost(config: ServerConfig): string;
```

Validation: port 1-65535, host is string.

### TDD Cycles

1. **Test: config with server section** → assert getServerPort/getServerHost return custom values
2. **Test: config without server section** → assert defaults (4269, '127.0.0.1')
3. **Test: invalid port rejected** → assert validation error on port 99999

### Files

- `src/config.ts` (MODIFY)

---

## Feature #3: PID file management

**Status**: `GAP`

### Design

```typescript
// src/pidfile.ts
export interface PidFileData {
  pid: number;
  port: number;
  startedAt: string;
  configPath: string;
}
export function getPidFilePath(dataPath: string): string;
export function writePidFile(dataPath: string, data: PidFileData): void;
export function readPidFile(dataPath: string): PidFileData | null;
export function removePidFile(dataPath: string): void;
export function isServerRunning(dataPath: string): { running: boolean; data: PidFileData | null };
```

`isServerRunning`: reads PID file → `process.kill(pid, 0)` → removes stale file if dead.

### TDD Cycles

1. **Test: write then read** → round-trip through temp dir
2. **Test: removePidFile** → write, remove, assert gone
3. **Test: isServerRunning with live process** → write current PID, assert running: true
4. **Test: isServerRunning with dead process** → write PID 999999, assert running: false + file cleaned
5. **Test: readPidFile missing** → assert null

### Files

- `src/pidfile.ts` (CREATE)

---

## Feature #4: HTTP server with StreamableHTTPServerTransport

**Status**: `GAP`

### Design

`src/server-http.ts` — core module using SDK's `createMcpExpressApp()`:

- `initializeSharedResources()` for one-time setup
- Express routes:
  - `POST /mcp` — session creation (new transport + McpServer per session) or route to existing
  - `GET /mcp` — SSE streams
  - `DELETE /mcp` — session termination
  - `GET /health` — `{ status, sessions, uptime, pid }`
- Session map: `Map<string, StreamableHTTPServerTransport>`
- PID file written on listen, removed on shutdown
- Graceful shutdown: close transports → stop watcher → close DB → remove PID file

Key: `createServer(config, db, extensions)` is cheap per-session (just tool/resource registration). Expensive resources (DB, watcher, extensions) shared.

`src/server-http-entry.ts` — tiny daemon entry:
```typescript
import { startHttpServer } from './server-http.js';
startHttpServer(configArg).catch(err => { console.error(err); process.exit(1); });
```

### TDD Cycles

1. **Test: /health returns status** → start on random port, GET /health, assert JSON
2. **Test: initialize creates session** → POST /mcp with init request, assert session ID header
3. **Test: existing session routes correctly** → init, then tools/list with session ID
4. **Test: missing session ID on non-init rejected** → assert 400
5. **Test: DELETE terminates session** → init, delete, assert sessions: 0
6. **Test: multiple concurrent sessions** → init 3, assert sessions: 3

### Files

- `src/server-http.ts` (CREATE)
- `src/server-http-entry.ts` (CREATE)
- `src/server.ts` (MODIFY — accept optional preloaded extensions)

---

## Feature #5: `limps start` and `limps stop` CLI commands

**Status**: `GAP`

### Design

**start.tsx**: Options: `--config`, `--project`, `--port`, `--foreground`
- Check if already running via PID file
- `--foreground`: call `startHttpServer()` directly
- Default: `spawn(process.execPath, [entry, ...], { detached: true, stdio: ['ignore', logFd, logFd] })`, `child.unref()`
- Log file: `{dataPath}/server.log`
- Print: `"Server started on http://127.0.0.1:4269/mcp (PID 12345)"`

**stop.tsx**: Options: `--config`, `--project`
- Read PID file → SIGTERM → poll for 5s → SIGKILL → remove PID file

### TDD Cycles

1. **Test: start --foreground** → start subprocess, assert /health accessible
2. **Test: start detects already running** → write PID file with current PID, assert message
3. **Test: stop kills process** → start subprocess, write PID, stop, assert dead
4. **Test: stop with no server** → no PID file, assert clean message

### Files

- `src/commands/start.tsx` (CREATE)
- `src/commands/stop.tsx` (CREATE)

---

## Feature #6: Remove `limps serve` and update CLI

**Status**: `GAP`

### Design

- Delete `src/commands/serve.tsx`
- Remove serve bypass hack in `src/cli.tsx` (lines 8-22)
- `package.json`: version → `3.0.0`, add `express` dep, `@types/express` devDep
- Update help text references

### TDD Cycles

1. **Test: serve is not a valid command** → assert error or helpful message
2. **Test: start appears in help** → assert discoverable

### Files

- `src/commands/serve.tsx` (DELETE)
- `src/cli.tsx` (MODIFY)
- `package.json` (MODIFY)

---

## Feature #7: Extension loading for multi-session

**Status**: `GAP`

### Design

Modify `createServer()` in `server.ts`:
```typescript
export async function createServer(
  config: ServerConfig,
  db: DatabaseType,
  preloadedExtensions?: LoadedExtension[]
): Promise<McpServer & { loadedExtensions?: LoadedExtension[] }>
```

When `preloadedExtensions` provided → skip `loadExtensions()`, use directly.
When absent → load as before (backward compat).

Extensions loaded once in `initializeSharedResources()`, stored in `SharedResources.loadedExtensions`.

### TDD Cycles

1. **Test: createServer with preloaded extensions** → pass mock, assert registered, assert no reload
2. **Test: createServer without preloaded (regression)** → same behavior as before

### Files

- `src/server.ts` (MODIFY)
- `src/server-shared.ts` (MODIFY)

---

## Dependency Graph

```
Feature #1 (shared init) ──┐
Feature #2 (config)  ───────┼──> Feature #4 (HTTP server) ──> Feature #5 (CLI start/stop)
Feature #3 (PID file) ─────┘                                        │
Feature #7 (extensions) ──> Feature #4                               v
                                                              Feature #6 (remove serve)
```

## Gotchas

- **SQLite concurrency**: `better-sqlite3` is synchronous, but Node.js single-thread serializes access. Safe in single process with multiple sessions.
- **McpServer 1:1 with transport**: SDK requires one McpServer per transport. Per-session creation is cheap.
- **Express 5 transitive dep**: Already pulled by `@modelcontextprotocol/sdk`. Add as direct dep for stability.
- **Port conflicts**: Catch `EADDRINUSE` in start command, suggest `--port`.
- **Log rotation**: Out of scope for v1, single `server.log` file.
- **stdio-only clients**: Clients that can't do HTTP need a proxy (`limps connect`) — fast follow, not in scope.
