import {
  configAddClaude,
  configAddClaudeCode,
  configAddCodex,
  configAddCursor,
  generateChatGptInstructions,
  generateConfigForPrint,
  previewMcpClientConfig,
} from './config-cmd.js';
import { getAdapter } from './mcp-client-adapter.js';
import { resolveConfigPath } from '../utils/config-resolver.js';

export type McpSyncClientId = 'claude' | 'cursor' | 'claude-code' | 'codex' | 'chatgpt';
export type McpAdapterId = Exclude<McpSyncClientId, 'chatgpt'>;

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

export function getSyncClients(): McpSyncClient[] {
  return [
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
      printOnly: true,
      runPrint: (projectFilter?: string[]) =>
        generateChatGptInstructions(() => resolveConfigPath(), projectFilter),
    },
  ];
}
