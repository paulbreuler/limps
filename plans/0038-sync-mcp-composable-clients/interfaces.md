# Interfaces

## Client Registry

```typescript
export type McpSyncClientId =
  | 'claude'
  | 'cursor'
  | 'claude-code'
  | 'codex'
  | 'chatgpt';

export interface McpSyncClient {
  id: McpSyncClientId;
  displayName: string;
  adapterId?: 'claude' | 'cursor' | 'claude-code' | 'codex';
  supportsPreview: boolean;
  supportsWrite: boolean;
  supportsPrint: boolean;
  printOnly?: boolean;
  runPreview?: (projectFilter?: string[]) => PreviewResult | Promise<PreviewResult>;
  runWrite?: (projectFilter?: string[]) => string | Promise<string>;
  runPrint?: (projectFilter?: string[]) => string | Promise<string>;
}

export interface PreviewResult {
  hasChanges: boolean;
  diffText: string;
  configPath: string;
  addedServers: string[];
  updatedServers: string[];
}

export function getSyncClients(): McpSyncClient[];
```

## Sync Command

```typescript
// sync-mcp options
const options = z.object({
  client: z.enum(['claude', 'cursor', 'claude-code', 'codex', 'chatgpt', 'all'])
});
```
