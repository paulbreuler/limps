import {
  configAddClaude,
  configAddClaudeCode,
  configAddCodex,
  configAddCursor,
  configAddLocalMcp,
  generateChatGptInstructions,
  generateConfigForPrint,
  previewMcpClientConfig,
} from './config-cmd.js';
import {
  getAdapter,
  getLocalAdapter,
  supportsLocalConfig,
  type LocalMcpClientType,
} from './mcp-client-adapter.js';

// Re-export LocalMcpClientType for consumers
export type { LocalMcpClientType } from './mcp-client-adapter.js';
import { resolveConfigPath } from '../utils/config-resolver.js';

export type McpSyncClientId =
  | 'claude'
  | 'cursor'
  | 'claude-code'
  | 'codex'
  | 'chatgpt'
  | 'opencode';
export type McpAdapterId = Exclude<McpSyncClientId, 'chatgpt' | 'opencode'>;

export interface PreviewResult {
  hasChanges: boolean;
  diffText: string;
  configPath: string;
  addedServers: string[];
  updatedServers: string[];
}

export interface McpSyncClient {
  id: McpSyncClientId;
  displayName: string;
  adapterId?: McpAdapterId;
  supportsPreview: boolean;
  supportsWrite: boolean;
  supportsPrint: boolean;
  printOnly?: boolean;
  /** Whether this client supports local workspace configs */
  supportsLocalConfig: boolean;
  runPreview?: (projectFilter?: string[]) => PreviewResult;
  runWrite?: (projectFilter?: string[]) => string;
  runPrint?: (projectFilter?: string[]) => string;
}

function createFileClient(params: {
  id: McpAdapterId;
  displayName: string;
  writeFn: (resolveConfigPathFn: () => string, projectFilter?: string[]) => string;
}): McpSyncClient {
  const { id, displayName, writeFn } = params;

  return {
    id,
    displayName,
    adapterId: id,
    supportsPreview: true,
    supportsWrite: true,
    supportsPrint: true,
    supportsLocalConfig: supportsLocalConfig(id),
    runPreview: (projectFilter?: string[]): PreviewResult => {
      const adapter = getAdapter(id);
      return previewMcpClientConfig(adapter, () => resolveConfigPath(), projectFilter);
    },
    runWrite: (projectFilter?: string[]): string =>
      writeFn(() => resolveConfigPath(), projectFilter),
    runPrint: (projectFilter?: string[]): string => {
      const adapter = getAdapter(id);
      return generateConfigForPrint(adapter, () => resolveConfigPath(), projectFilter);
    },
  };
}

/**
 * Get all available global sync clients.
 * These write to global/user-level config files.
 */
export function getSyncClients(): McpSyncClient[] {
  const clients: McpSyncClient[] = [
    createFileClient({
      id: 'claude',
      displayName: 'Claude Desktop',
      writeFn: configAddClaude,
    }),
    createFileClient({
      id: 'cursor',
      displayName: 'Cursor',
      writeFn: configAddCursor,
    }),
    createFileClient({
      id: 'claude-code',
      displayName: 'Claude Code',
      writeFn: configAddClaudeCode,
    }),
    createFileClient({
      id: 'codex',
      displayName: 'OpenAI Codex',
      writeFn: configAddCodex,
    }),
    {
      id: 'chatgpt',
      displayName: 'ChatGPT',
      supportsPreview: false,
      supportsWrite: false,
      supportsPrint: true,
      supportsLocalConfig: false,
      printOnly: true,
      runPrint: (projectFilter?: string[]) =>
        generateChatGptInstructions(() => resolveConfigPath(), projectFilter),
    },
    {
      id: 'opencode',
      displayName: 'OpenCode',
      supportsPreview: false,
      supportsWrite: false,
      supportsPrint: true,
      supportsLocalConfig: true,
      printOnly: true,
      runPrint: (projectFilter?: string[]): string => {
        const adapter = getLocalAdapter('opencode');
        return generateConfigForPrint(adapter, () => resolveConfigPath(), projectFilter);
      },
    },
  ];

  return clients;
}

/**
 * Create a local config client for a specific MCP client type.
 * This writes to workspace-level config files (e.g., .cursor/mcp.json, .mcp.json).
 *
 * @param clientType - The client type to create a local adapter for
 * @param customPath - Optional custom path for the config file
 */
export function createLocalClient(
  clientType: LocalMcpClientType,
  customPath?: string
): {
  adapter: ReturnType<typeof getLocalAdapter>;
  displayName: string;
  runPreview: (projectFilter?: string[]) => PreviewResult;
  runWrite: (projectFilter?: string[]) => string;
  runPrint: (projectFilter?: string[]) => string;
} {
  const adapter = getLocalAdapter(clientType, customPath);

  return {
    adapter,
    displayName: adapter.getDisplayName(),
    runPreview: (projectFilter?: string[]): PreviewResult => {
      return previewMcpClientConfig(adapter, () => resolveConfigPath(), projectFilter);
    },
    runWrite: (projectFilter?: string[]): string => {
      // Pass the adapter directly to preserve display name and settings
      return configAddLocalMcp(() => resolveConfigPath(), projectFilter, adapter);
    },
    runPrint: (projectFilter?: string[]): string => {
      return generateConfigForPrint(adapter, () => resolveConfigPath(), projectFilter);
    },
  };
}

/**
 * Map sync client ID to local client type (for clients that support local configs)
 */
export function getLocalClientType(clientId: McpSyncClientId): LocalMcpClientType | null {
  switch (clientId) {
    case 'cursor':
      return 'cursor';
    case 'claude-code':
      return 'claude-code';
    case 'opencode':
      return 'opencode';
    default:
      return null;
  }
}
