---
tags: [interfaces, v3]
---

# Interfaces

## server-shared.ts (NEW)

```typescript
import type { ServerConfig } from './config.js';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { LimpsWatcher } from './watcher.js';
import type { LoadedExtension } from './extensions/loader.js';

export interface SharedResources {
  config: ServerConfig;
  configPath: string;
  db: DatabaseType;
  watcher: LimpsWatcher | null;
  loadedExtensions: LoadedExtension[];
}

export async function initializeSharedResources(
  configPathArg?: string
): Promise<SharedResources>;

export async function cleanupSharedResources(
  resources: SharedResources
): Promise<void>;
```

## config.ts (MODIFY)

```typescript
// Add to ServerConfig interface
server?: {
  port?: number;    // default: 4269
  host?: string;    // default: '127.0.0.1'
};

// New exports
export const DEFAULT_SERVER_PORT: number;  // 4269
export const DEFAULT_SERVER_HOST: string;  // '127.0.0.1'
export function getServerPort(config: ServerConfig): number;
export function getServerHost(config: ServerConfig): string;
```

## pidfile.ts (NEW)

```typescript
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

## server-http.ts (NEW)

```typescript
export async function startHttpServer(configPathArg?: string): Promise<void>;
```

Internal (not exported but important for testing):
- Session map: `Map<string, StreamableHTTPServerTransport>`
- Routes: `POST /mcp`, `GET /mcp`, `DELETE /mcp`, `GET /health`
- Health response: `{ status: string; sessions: number; uptime: number; pid: number }`

## server.ts (MODIFY)

```typescript
// Updated signature — preloadedExtensions is optional for backward compat
export async function createServer(
  config: ServerConfig,
  db: DatabaseType,
  preloadedExtensions?: LoadedExtension[]
): Promise<McpServer & { loadedExtensions?: LoadedExtension[] }>;
```

## CLI Commands

### start.tsx
```typescript
export const options: z.ZodObject<{
  config: z.ZodOptional<z.ZodString>;
  project: z.ZodOptional<z.ZodString>;
  port: z.ZodOptional<z.ZodNumber>;
  foreground: z.ZodOptional<z.ZodBoolean>;
}>;
```

### stop.tsx
```typescript
export const options: z.ZodObject<{
  config: z.ZodOptional<z.ZodString>;
  project: z.ZodOptional<z.ZodString>;
}>;
```
