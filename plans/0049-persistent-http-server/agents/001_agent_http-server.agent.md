---
title: HTTP Server and CLI Commands
status: GAP
persona: coder
depends_on:
  - ./000_agent_foundation.agent.md
files:
  - packages/limps/src/server-http.ts
  - packages/limps/src/server-http-entry.ts
  - packages/limps/src/commands/start.tsx
  - packages/limps/src/commands/stop.tsx
  - packages/limps/tests/server-http.test.ts
  - packages/limps/tests/commands/start.test.ts
  - packages/limps/tests/commands/stop.test.ts
tags:
  - server
  - http
  - cli
  - transport
---






# Agent 1: HTTP Server and CLI Commands

**Plan Location**: `plans/0049-persistent-http-server/0049-persistent-http-server-plan.md`

## Scope

Features: #4, #5
Own: `src/server-http.ts`, `src/server-http-entry.ts`, `src/commands/start.tsx`, `src/commands/stop.tsx`
Depend on: Agent 0 for `initializeSharedResources`, config helpers, PID file, `createServer` with preloaded extensions
Block: Agent 2 waiting on working start/stop

## Interfaces

### Export

```typescript
// #4 — server-http.ts (CREATE)
export async function startHttpServer(configPathArg?: string): Promise<void>;

// #5 — commands/start.tsx (CREATE)
export const description: string;  // 'Start the limps HTTP server'
export const options: z.ZodObject<{
  config: z.ZodOptional<z.ZodString>;
  project: z.ZodOptional<z.ZodString>;
  port: z.ZodOptional<z.ZodNumber>;
  foreground: z.ZodOptional<z.ZodBoolean>;
}>;

// #5 — commands/stop.tsx (CREATE)
export const description: string;  // 'Stop the running limps server'
export const options: z.ZodObject<{
  config: z.ZodOptional<z.ZodString>;
  project: z.ZodOptional<z.ZodString>;
}>;
```

### Receive (from Agent 0) ✅ READY when Agent 0 is PASS

```typescript
// server-shared.ts
import { initializeSharedResources, cleanupSharedResources } from './server-shared.js';
// config.ts
import { getServerPort, getServerHost } from './config.js';
// pidfile.ts
import { writePidFile, readPidFile, removePidFile, isServerRunning } from './pidfile.js';
// server.ts
import { createServer } from './server.js';
```

## Features

### #4: HTTP server with StreamableHTTPServerTransport

TL;DR: Express app with MCP session management via SDK's StreamableHTTPServerTransport.
Status: `GAP`
Files: `src/server-http.ts` (create), `src/server-http-entry.ts` (create)

SDK imports:
```typescript
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
```

Structure:
```typescript
const sessions = new Map<string, StreamableHTTPServerTransport>();

export async function startHttpServer(configPathArg?: string): Promise<void> {
  const shared = await initializeSharedResources(configPathArg);
  const app = createMcpExpressApp({ host: getServerHost(shared.config) });
  const port = getServerPort(shared.config);

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      await sessions.get(sessionId)!.handleRequest(req, res, req.body);
    } else if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => { sessions.set(sid, transport); },
      });
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };
      const server = await createServer(shared.config, shared.db, shared.loadedExtensions);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } else {
      res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request' }, id: null });
    }
  });

  app.get('/mcp', async (req, res) => { /* SSE: session lookup + handleRequest */ });
  app.delete('/mcp', async (req, res) => { /* session termination */ });
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', sessions: sessions.size, uptime: process.uptime(), pid: process.pid });
  });

  const httpServer = app.listen(port, getServerHost(shared.config), () => {
    writePidFile(shared.config.dataPath, { pid: process.pid, port, startedAt: new Date().toISOString(), configPath: shared.configPath });
    console.error(`limps HTTP server listening on http://${getServerHost(shared.config)}:${port}/mcp`);
  });

  setupGracefulShutdown(httpServer, sessions, shared);
}
```

Graceful shutdown: close all transports → `cleanupSharedResources(shared)` → remove PID file → `httpServer.close()`.

`server-http-entry.ts` is a tiny daemon bootstrap:
```typescript
import { startHttpServer } from './server-http.js';
const configPath = process.argv.find((_, i, arr) => arr[i-1] === '--config');
startHttpServer(configPath).catch(err => { console.error(err); process.exit(1); });
```

TDD:
1. `/health returns JSON` → start on port 0 (random), GET /health, assert `{ status: 'ok', sessions: 0 }`
2. `POST /mcp initialize creates session` → send init JSON-RPC, assert 200 + `mcp-session-id` header
3. `POST /mcp with session routes to existing` → init → tools/list with session ID → assert tool list
4. `POST /mcp without session on non-init returns 400` → send tools/list without session ID → assert 400
5. `DELETE /mcp terminates session` → init → delete → health shows sessions: 0
6. `multiple concurrent sessions` → init 3 → health shows sessions: 3

Gotchas:
- Use port 0 for tests (OS assigns random available port)
- `app.listen` callback gives actual port via `httpServer.address().port`
- Close httpServer in afterEach to prevent test leaks

---

### #5: `limps start` and `limps stop` CLI commands

TL;DR: Daemon management CLI — start spawns detached process, stop kills it.
Status: `GAP`
Files: `src/commands/start.tsx` (create), `src/commands/stop.tsx` (create)

**start.tsx** — Pastel command component:
- Resolve config via `--config` or `--project`
- Check `isServerRunning()` — if yes, print message and exit
- If `--foreground`: call `startHttpServer()` directly (blocks)
- If `--port`: override config port via env var or CLI pass-through
- Else: daemon mode:
  ```typescript
  const logPath = resolve(config.dataPath, 'server.log');
  const logFd = openSync(logPath, 'a');
  const entryScript = resolve(__dirname, '../server-http-entry.js');
  const child = spawn(process.execPath, [entryScript, '--config', configPath], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  closeSync(logFd);
  ```
- Wait briefly (up to 3s) polling `isServerRunning()` to confirm startup
- Print: `"Server started on http://{host}:{port}/mcp (PID {pid})"`

**stop.tsx** — Pastel command component:
- Resolve config, call `isServerRunning()`
- If not running: print "No server running" and exit
- Send `process.kill(pid, 'SIGTERM')`
- Poll `isServerRunning()` every 500ms for up to 5s
- If still alive: `process.kill(pid, 'SIGKILL')`
- Remove PID file
- Print confirmation

TDD:
1. `start --foreground starts accessible server` → spawn as subprocess with --foreground on random port → assert /health responds → kill
2. `start detects already-running` → write PID file with process.pid → run start → assert "already running" output
3. `stop sends SIGTERM` → spawn background process, write PID → run stop logic → assert process dead + PID file gone
4. `stop with no server` → no PID file → assert "No server running"

Gotchas:
- Daemon spawn needs `__dirname` resolution for `server-http-entry.js` — use `import.meta.url` + `fileURLToPath`
- `--port` override: pass as `--port` arg to entry script, or set `LIMPS_SERVER_PORT` env var

---

## Done

- [ ] HTTP server handles sessions correctly
- [ ] /health endpoint works
- [ ] `limps start` spawns daemon and confirms
- [ ] `limps start --foreground` runs in current process
- [ ] `limps stop` kills daemon cleanly
- [ ] All TDD cycles pass
- [ ] `npm run build` clean
- [ ] `npm test` passes
- [ ] Status → PASS

<!-- limps:graph-links:start -->
## LIMPS Graph Links

Plan:
- [Plan](../0049-persistent-http-server-plan.md)

Depends on:
- [Agent 000](./000_agent_foundation.agent.md)

Blocks:
_No blocks found_

<!-- limps:graph-links:end -->
