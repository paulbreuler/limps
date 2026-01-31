# Interfaces

## MCP Client Adapters

```typescript
export class CodexAdapter implements McpClientAdapter {
  getConfigPath(): string;
  getServersKey(): string; // "mcp_servers"
  readConfig(): McpClientConfig;
  writeConfig(config: McpClientConfig): void;
  createServerConfig(configPath: string): McpServerConfig;
  getDisplayName(): string; // "OpenAI Codex"
}

export function getAdapter(
  clientType: 'claude' | 'cursor' | 'claude-code' | 'codex'
): McpClientAdapter;
```

## Config Commands

```typescript
export function configAddCodex(
  resolveConfigPathFn: () => string,
  projectFilter?: string[]
): string;

export function generateChatGptInstructions(
  resolveConfigPathFn: () => string,
  projectFilter?: string[]
): string;
```

## Sync Command Options

```typescript
const options = z.object({
  client: z.enum(['claude', 'cursor', 'claude-code', 'codex', 'chatgpt', 'all'])
});
```
