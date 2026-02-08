import { generateChatGptInstructions, generateConfigForPrint } from './config-cmd.js';
import { getAdapter, getLocalAdapter } from './mcp-client-adapter.js';

export type McpSyncClientId =
  | 'claude'
  | 'cursor'
  | 'claude-code'
  | 'codex'
  | 'chatgpt'
  | 'opencode';

export interface McpSyncClient {
  id: McpSyncClientId;
  displayName: string;
  runPrint: (configPath: string) => string;
}

/**
 * Get all available sync clients (print-only).
 */
export function getSyncClients(): McpSyncClient[] {
  return [
    {
      id: 'claude',
      displayName: 'Claude Desktop',
      runPrint: (configPath: string): string => {
        const adapter = getAdapter('claude');
        return generateConfigForPrint(adapter, configPath);
      },
    },
    {
      id: 'cursor',
      displayName: 'Cursor',
      runPrint: (configPath: string): string => {
        const adapter = getAdapter('cursor');
        return generateConfigForPrint(adapter, configPath);
      },
    },
    {
      id: 'claude-code',
      displayName: 'Claude Code',
      runPrint: (configPath: string): string => {
        const adapter = getAdapter('claude-code');
        return generateConfigForPrint(adapter, configPath);
      },
    },
    {
      id: 'codex',
      displayName: 'OpenAI Codex',
      runPrint: (configPath: string): string => {
        const adapter = getAdapter('codex');
        return generateConfigForPrint(adapter, configPath);
      },
    },
    {
      id: 'chatgpt',
      displayName: 'ChatGPT',
      runPrint: (configPath: string): string => generateChatGptInstructions(configPath),
    },
    {
      id: 'opencode',
      displayName: 'OpenCode',
      runPrint: (configPath: string): string => {
        const adapter = getLocalAdapter('opencode');
        return generateConfigForPrint(adapter, configPath);
      },
    },
  ];
}
