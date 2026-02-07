---
title: Foundation — Shared Init, Config, PID File, Extensions
status: GAP
persona: coder
depends_on: []
files: [packages/limps/src/server-shared.ts, packages/limps/src/server-main.ts, packages/limps/src/config.ts, packages/limps/src/pidfile.ts, packages/limps/src/server.ts, packages/limps/tests/server-shared.test.ts, packages/limps/tests/pidfile.test.ts, packages/limps/tests/config.test.ts]
tags: [server, config, infrastructure]
---

# Agent 0: Foundation

**Plan Location**: `plans/0049-persistent-http-server/0049-persistent-http-server-plan.md`

## Scope

Features: #1, #2, #3, #7
Own: `src/server-shared.ts`, `src/pidfile.ts`, config additions
Depend on: Nothing
Block: Agent 1 waiting on shared init, config, PID file, extension preloading

## Interfaces

### Export

```typescript
// #1 — server-shared.ts (CREATE)
export interface SharedResources {
  config: ServerConfig;
  configPath: string;
  db: DatabaseType;
  watcher: LimpsWatcher | null;
  loadedExtensions: LoadedExtension[];
}
export async function initializeSharedResources(configPathArg?: string): Promise<SharedResources>;
export async function cleanupSharedResources(resources: SharedResources): Promise<void>;

// #2 — config.ts (MODIFY)
// Add to ServerConfig:
//   server?: { port?: number; host?: string; }
export const DEFAULT_SERVER_PORT = 4269;
export const DEFAULT_SERVER_HOST = '127.0.0.1';
export function getServerPort(config: ServerConfig): number;
export function getServerHost(config: ServerConfig): string;

// #3 — pidfile.ts (CREATE)
export interface PidFileData { pid: number; port: number; startedAt: string; configPath: string; }
export function getPidFilePath(dataPath: string): string;
export function writePidFile(dataPath: string, data: PidFileData): void;
export function readPidFile(dataPath: string): PidFileData | null;
export function removePidFile(dataPath: string): void;
export function isServerRunning(dataPath: string): { running: boolean; data: PidFileData | null };

// #7 — server.ts (MODIFY)
export async function createServer(
  config: ServerConfig, db: DatabaseType, preloadedExtensions?: LoadedExtension[]
): Promise<McpServer & { loadedExtensions?: LoadedExtension[] }>;
```

## Features

### #1: Extract shared initialization

TL;DR: Extract init logic from `server-main.ts` into reusable `server-shared.ts`.
Status: `GAP`
Files: `src/server-shared.ts` (create), `src/server-main.ts` (modify)

Current `server-main.ts` lines 39-179 contain all init: config resolve → load → mkdirSync → initializeDatabase → createSchema → indexAllPaths → checkFdBudget → startWatcher. Extract lines 59-162 into `initializeSharedResources()`.

Also load extensions here (currently done inside `createServer`). Store in `SharedResources.loadedExtensions`.

Refactor `startMcpServer()` to:
```typescript
const shared = await initializeSharedResources(configPathArg);
const server = await createServer(shared.config, shared.db, shared.loadedExtensions);
await startServer(server, () => cleanupSharedResources(shared));
```

Keep the global `watcher`/`db` cleanup at top of `startMcpServer` for the re-call safety check.

TDD:
1. `initializeSharedResources returns valid SharedResources` → temp config + plans dir → assert db open, config populated, watcher started → cleanup
2. `cleanupSharedResources closes db and watcher` → init → cleanup → assert db.open is false
3. `startMcpServer regression` → existing server-main tests pass unchanged

Gotchas:
- `resolveConfigPath` throws if no config found: test must provide valid path
- Watcher may fail in CI (no paths to watch): handle null watcher gracefully

---

### #2: Server config fields

TL;DR: Add `server.port` and `server.host` to config with defaults and validation.
Status: `GAP`
Files: `src/config.ts` (modify)

Add to `ServerConfig` interface, add constants, add getter helpers, add validation (port 1-65535).

TDD:
1. `config with server section returns custom values` → JSON with port 8080 → assert getServerPort returns 8080
2. `config without server section uses defaults` → no server field → assert 4269 / '127.0.0.1'
3. `invalid port rejected` → port 99999 → assert validation throws

Gotchas:
- Existing `validateConfig` pattern: check how other optional sections are validated

---

### #3: PID file management

TL;DR: Module for daemon PID/port tracking in `{dataPath}/server.pid`.
Status: `GAP`
Files: `src/pidfile.ts` (create)

JSON format: `{ pid, port, startedAt, configPath }`. `isServerRunning` does `process.kill(pid, 0)` — returns true if alive, cleans stale file if dead.

TDD:
1. `write then read round-trips` → temp dir → write → read → assert match
2. `removePidFile deletes file` → write → remove → assert !existsSync
3. `isServerRunning with live process` → write with process.pid → assert running: true
4. `isServerRunning with dead process` → write with PID 999999 → assert running: false, file cleaned
5. `readPidFile returns null for missing` → empty temp dir → assert null

Gotchas:
- `process.kill(pid, 0)` throws ESRCH for dead process, EPERM for permission denied (still alive)

---

### #7: Extension loading for multi-session

TL;DR: Make `createServer()` accept pre-loaded extensions to avoid reloading per session.
Status: `GAP`
Files: `src/server.ts` (modify)

Add optional `preloadedExtensions?: LoadedExtension[]` param. When provided, skip `loadExtensions(config)` call, use provided list directly. When absent, load as before.

TDD:
1. `createServer with preloadedExtensions uses them` → pass mock extensions → assert tools registered
2. `createServer without preloadedExtensions loads normally` → existing behavior regression

Gotchas:
- Extension tools registered via `server.tool()` — same registration works whether loaded fresh or passed in

---

## Done

- [ ] All TDD cycles pass
- [ ] Exports match interfaces.md
- [ ] `server-main.ts` still works (regression)
- [ ] `npm run build` clean
- [ ] `npm test` passes
- [ ] Status → PASS
