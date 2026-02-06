---
name: limps-nonblocking-startup
description: Non-blocking MCP server startup with request queuing, progress tracking, and enhanced configuration support
tags:
  - mcp
  - server
  - startup
  - indexing
  - config
  - gitignore
  - env-vars
status: GAP
dependencies: []
---

# Plan 0048: Non-blocking MCP Server Startup with Enhanced Configuration

## Overview

This plan addresses two critical issues:
1. **Startup Blocking**: LIMPS blocks during initial document indexing, causing MCP clients to hang
2. **Configuration Limitations**: No support for environment variables, .gitignore patterns, or proper docsPath warnings

## Goals

1. Make server startup non-blocking with request queuing during initialization
2. Provide clear progress tracking and user feedback during indexing
3. Support environment variable expansion in config paths
4. Respect .gitignore patterns during indexing
5. Warn users about potentially large indexing operations

## Implementation Phases

### Phase 1: Hotfix PR (Immediate)

**Branch**: `fix/config-indexing-warning`

#### Tasks
- [ ] Fix root `config.json` - remove `"docsPaths": ["."]`
- [ ] Add warning when indexing >50 files
- [ ] Update DEFAULT_CONFIG comments

**Files Modified**:
- `config.json`
- `packages/limps/src/indexer.ts`
- `packages/limps/src/config.ts`

### Phase 2: Core Infrastructure

**Branch**: `feat/non-blocking-startup`

#### 2.1 Create Server State Module

**New File**: `packages/limps/src/server-state.ts`

```typescript
export type ServerStatus = 'initializing' | 'ready' | 'error';

export interface ServerState {
  status: ServerStatus;
  progress: {
    indexed: number;
    total: number;
    currentFile?: string;
  };
  startTime: number;
  errors: string[];
}

export const serverState: ServerState = {
  status: 'initializing',
  progress: { indexed: 0, total: 0 },
  startTime: Date.now(),
  errors: []
};

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
```

#### 2.2 Modify Server Startup

**File**: `packages/limps/src/server-main.ts`

Changes:
1. Move `await server.connect(transport)` BEFORE indexing
2. Start indexing in background async function
3. Update server state as progress happens

Key code changes:
```typescript
export async function startMcpServer(configPathArg?: string): Promise<void> {
  // ... setup database (keep existing) ...
  
  // START SERVER IMMEDIATELY
  const server = await createServer(config, db);
  await startServer(server, onShutdown);
  
  // Then start background indexing
  startBackgroundIndexing(db, config).catch(err => {
    serverState.status = 'error';
    serverState.errors.push(err.message);
    console.error('Fatal indexing error:', err);
  });
}

async function startBackgroundIndexing(db: DatabaseType, config: ServerConfig): Promise<void> {
  const files = await collectAllFiles(config);
  serverState.progress.total = files.length;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    serverState.progress.currentFile = file;
    
    try {
      await indexDocument(db, file);
      serverState.progress.indexed = i + 1;
      
      // Log every 10 files or on completion
      if ((i + 1) % 10 === 0 || i === files.length - 1) {
        const percent = Math.round(((i + 1) / files.length) * 100);
        console.error(`📊 Indexed ${i + 1}/${files.length} (${percent}%)`);
      }
    } catch (error) {
      console.error(`❌ Failed to index ${file}:`, error);
      serverState.errors.push(`${file}: ${error}`);
    }
  }
  
  serverState.status = 'ready';
  serverState.progress.currentFile = undefined;
  const duration = Date.now() - serverState.startTime;
  console.error(`✅ Ready! Indexed ${files.length} files in ${formatDuration(duration)}`);
}
```

### Phase 3: Tool Handler Wrapper

#### 3.1 Create Tool Wrapper Utility

**New File**: `packages/limps/src/utils/tool-wrapper.ts`

```typescript
import { serverState, formatDuration } from '../server-state.js';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';

export function withServerCheck<T extends Record<string, unknown>>(
  handler: ToolCallback<T>,
  options: { allowDuringInit?: boolean } = {}
): ToolCallback<T> {
  return async (args, extra) => {
    if (serverState.status === 'initializing' && !options.allowDuringInit) {
      const elapsed = Date.now() - serverState.startTime;
      const { indexed, total } = serverState.progress;
      const percent = total > 0 ? Math.round((indexed / total) * 100) : 0;
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'initializing',
            message: 'Server is currently indexing documents',
            elapsed_seconds: Math.floor(elapsed / 1000),
            progress: {
              indexed,
              total,
              percent,
              current_file: serverState.progress.currentFile
            },
            ready: false,
            retry_in_seconds: 5
          }, null, 2)
        }]
      };
    }
    
    if (serverState.status === 'error') {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'error',
            message: 'Server encountered errors during initialization',
            errors: serverState.errors,
            ready: false
          }, null, 2)
        }]
      };
    }
    
    // Server is ready, call handler
    return handler(args, extra);
  };
}
```

#### 3.2 Update Tool Registration

**File**: `packages/limps/src/tools/index.ts`

Wrap existing tool registrations:

```typescript
import { withServerCheck } from '../utils/tool-wrapper.js';

// Existing tool definitions stay the same
// Just wrap them during registration:

server.tool('list_plans', 
  'List all available plans', 
  ListPlansInputSchema.shape,
  withServerCheck(listPlansHandler)
);

server.tool('list_agents',
  'List agents for a plan',
  ListAgentsInputSchema.shape,
  withServerCheck(listAgentsHandler)
);

// ... wrap all existing tools ...

// server_status is ALWAYS available (not wrapped)
server.tool('server_status',
  'Check server initialization status',
  {},
  async () => {
    const elapsed = Date.now() - serverState.startTime;
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: serverState.status,
          ready: serverState.status === 'ready',
          elapsed_seconds: Math.floor(elapsed / 1000),
          progress: {
            indexed: serverState.progress.indexed,
            total: serverState.progress.total,
            percent: serverState.progress.total > 0
              ? Math.round((serverState.progress.indexed / serverState.progress.total) * 100)
              : 0,
            current_file: serverState.progress.currentFile
          },
          errors: serverState.errors.length > 0 ? serverState.errors : undefined
        }, null, 2)
      }]
    };
  }
);
```

### Phase 4: Gitignore Support

#### 4.1 Create Gitignore Parser

**New File**: `packages/limps/src/utils/gitignore.ts`

```typescript
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function loadGitignorePatterns(dir: string): string[] {
  const gitignorePath = join(dir, '.gitignore');
  if (!existsSync(gitignorePath)) {
    return [];
  }
  
  try {
    const content = readFileSync(gitignorePath, 'utf-8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(pattern => {
        // Convert gitignore to glob
        if (pattern.startsWith('/')) {
          return pattern.slice(1);
        }
        if (pattern.endsWith('/')) {
          return `${pattern}**`;
        }
        return pattern;
      });
  } catch {
    return [];
  }
}

export function shouldIgnore(filePath: string, patterns: string[]): boolean {
  // Simple pattern matching (can enhance with minimatch later)
  for (const pattern of patterns) {
    if (filePath.includes(pattern)) {
      return true;
    }
  }
  return false;
}
```

#### 4.2 Integrate into Indexing

**Update**: `packages/limps/src/indexer.ts`

```typescript
import { loadGitignorePatterns, shouldIgnore } from './utils/gitignore.js';

function buildIgnorePatterns(config: ServerConfig, docsPath: string): string[] {
  const basePatterns = [
    '.git', 'node_modules', '.tmp', '.obsidian',
    'dist', 'build', 'coverage', '.next', '.vercel'
  ];
  
  // Load .gitignore from each docs path
  const gitignorePatterns = loadGitignorePatterns(docsPath);
  
  return [...new Set([...basePatterns, ...gitignorePatterns])];
}
```

### Phase 5: Environment Variable Expansion

#### 5.1 Update Config Loading

**Update**: `packages/limps/src/config.ts`

```typescript
function expandEnvVars(str: string): string {
  return str.replace(/\$\{(\w+)\}/g, (_, varName) => {
    const value = process.env[varName];
    if (value === undefined) {
      console.warn(`Environment variable ${varName} not found`);
      return '';
    }
    return value;
  });
}

// Update resolvePath function:
const resolvePath = (p: string): string => {
  // Step 1: Expand env vars
  const expanded = expandEnvVars(p);
  // Step 2: Expand tilde
  const withTilde = expandTilde(expanded);
  // Step 3: Resolve relative to config dir
  if (p.startsWith('~') || path.isAbsolute(withTilde)) {
    return withTilde;
  }
  return resolve(configDir, withTilde);
};
```

## Test Plan

### Hotfix Tests
- [ ] Config without docsPaths only indexes plans directory
- [ ] Warning appears when indexing >50 files
- [ ] Existing functionality unchanged

### Comprehensive Tests
- [ ] Server starts immediately (no blocking)
- [ ] Tool calls during init return proper JSON response
- [ ] server_status shows accurate progress
- [ ] When ready, all tools work normally
- [ ] .gitignore patterns respected
- [ ] Environment variables expanded in paths
- [ ] Cross-platform path handling works

## Files to Create/Modify

### New Files
1. `packages/limps/src/server-state.ts` - Server state management
2. `packages/limps/src/utils/tool-wrapper.ts` - Tool handler wrapper
3. `packages/limps/src/utils/gitignore.ts` - Gitignore parsing

### Modified Files
1. `packages/limps/src/server-main.ts` - Non-blocking startup
2. `packages/limps/src/tools/index.ts` - Tool registration with wrapper
3. `packages/limps/src/config.ts` - Environment variable expansion
4. `packages/limps/src/indexer.ts` - Gitignore integration + warnings
5. `config.json` - Remove docsPaths

## Related Issues

- GitHub Issue #87: Support relative paths and environment variables in config
- Current issue: Server hangs during tool calls due to blocking indexing

## Acceptance Criteria

1. Server starts within 2 seconds regardless of document count
2. Tool calls during initialization return clear JSON with progress info
3. First-time indexing of 200+ files completes without blocking
4. Environment variables like `${HOME}` work in all path configs
5. Files matching .gitignore are not indexed
6. Users get warnings when configs would index >50 files

## Notes

- This is a breaking change for clients that expect synchronous responses
- The `server_status` tool provides a migration path for users
- Consider adding a `--wait-for-ready` flag for CLI usage in scripts
