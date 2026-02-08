/**
 * MCP Client Configuration Adapters
 * Provides loosely coupled adapters for different MCP clients (Claude Desktop, Cursor, etc.)
 */

import { join } from 'path';
import { homedir } from 'os';

/**
 * MCP server configuration entry.
 * limps v3 uses HTTP transport exclusively (persistent daemon mode).
 */
export interface McpServerConfig {
  transport: {
    type: 'http';
    url: string;
  };
}

/**
 * Adapter interface for MCP client configurations.
 * All adapters generate HTTP transport configs (limps v3 daemon mode).
 */
export interface McpClientAdapter {
  /** Get the config file path for this client */
  getConfigPath(): string;

  /** Get the key name for the servers object (e.g., "mcpServers" or "mcp.servers") */
  getServersKey(): string;

  /** Whether the servers key should be treated as a flat key or nested path (default: nested) */
  useFlatKey?(): boolean;

  /** Create HTTP transport server config for a limps project */
  createHttpServerConfig(host: string, port: number): McpServerConfig;

  /** Get display name for this client */
  getDisplayName(): string;
}

/**
 * Claude Desktop adapter
 * Uses: mcpServers key, HTTP transport, ~/Library/Application Support/Claude/claude_desktop_config.json
 */
export class ClaudeDesktopAdapter implements McpClientAdapter {
  getConfigPath(): string {
    const home = homedir();
    return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }

  getServersKey(): string {
    return 'mcpServers';
  }

  createHttpServerConfig(host: string, port: number): McpServerConfig {
    return {
      transport: {
        type: 'http',
        url: `http://${host}:${port}/mcp`,
      },
    };
  }

  getDisplayName(): string {
    return 'Claude Desktop';
  }
}

/**
 * Cursor adapter
 * Uses: mcp.servers key, HTTP transport, VS Code settings.json location
 */
export class CursorAdapter implements McpClientAdapter {
  private getSettingsPath(): string {
    const home = homedir();
    // Cursor uses VS Code settings.json location
    // macOS: ~/Library/Application Support/Cursor/User/settings.json
    // Linux: ~/.config/Cursor/User/settings.json
    // Windows: %APPDATA%\Cursor\User\settings.json
    if (process.platform === 'darwin') {
      return join(home, 'Library', 'Application Support', 'Cursor', 'User', 'settings.json');
    } else if (process.platform === 'win32') {
      return join(
        process.env.APPDATA || join(home, 'AppData', 'Roaming'),
        'Cursor',
        'User',
        'settings.json'
      );
    } else {
      return join(
        process.env.XDG_CONFIG_HOME || join(home, '.config'),
        'Cursor',
        'User',
        'settings.json'
      );
    }
  }

  getConfigPath(): string {
    return this.getSettingsPath();
  }

  getServersKey(): string {
    return 'mcp.servers';
  }

  useFlatKey(): boolean {
    return true;
  }

  createHttpServerConfig(host: string, port: number): McpServerConfig {
    return {
      transport: {
        type: 'http',
        url: `http://${host}:${port}/mcp`,
      },
    };
  }

  getDisplayName(): string {
    return 'Cursor';
  }
}

/**
 * Claude Code adapter
 * Uses: mcpServers key, HTTP transport, ~/.claude.json (user scope)
 */
export class ClaudeCodeAdapter implements McpClientAdapter {
  getConfigPath(): string {
    const home = homedir();
    return join(home, '.claude.json');
  }

  getServersKey(): string {
    return 'mcpServers';
  }

  createHttpServerConfig(host: string, port: number): McpServerConfig {
    return {
      transport: {
        type: 'http',
        url: `http://${host}:${port}/mcp`,
      },
    };
  }

  getDisplayName(): string {
    return 'Claude Code';
  }
}

/**
 * OpenAI Codex adapter
 * Uses: mcp_servers key, TOML config at ~/.codex/config.toml
 */
export class CodexAdapter implements McpClientAdapter {
  getConfigPath(): string {
    const home = homedir();
    return join(home, '.codex', 'config.toml');
  }

  getServersKey(): string {
    return 'mcp_servers';
  }

  createHttpServerConfig(host: string, port: number): McpServerConfig {
    return {
      transport: {
        type: 'http',
        url: `http://${host}:${port}/mcp`,
      },
    };
  }

  getDisplayName(): string {
    return 'OpenAI Codex';
  }
}

/**
 * Supported MCP client types for local workspace configs
 */
export type LocalMcpClientType = 'cursor' | 'claude-code' | 'opencode' | 'custom';

/**
 * Get the default local config path for a given client type
 */
export function getLocalConfigPath(clientType: LocalMcpClientType, customPath?: string): string {
  if (customPath) {
    return customPath;
  }

  switch (clientType) {
    case 'cursor':
      return join(process.cwd(), '.cursor', 'mcp.json');
    case 'claude-code':
      return join(process.cwd(), '.mcp.json');
    case 'opencode':
      return join(process.cwd(), 'opencode.json');
    case 'custom':
      return join(process.cwd(), '.mcp.json');
    default:
      return join(process.cwd(), '.mcp.json');
  }
}

/**
 * Get the display name for a local config client type
 */
export function getLocalConfigDisplayName(clientType: LocalMcpClientType): string {
  switch (clientType) {
    case 'cursor':
      return 'Cursor Local (.cursor/mcp.json)';
    case 'claude-code':
      return 'Claude Code Local (.mcp.json)';
    case 'opencode':
      return 'OpenCode (opencode.json)';
    case 'custom':
      return 'Local MCP Config';
    default:
      return 'Local MCP Config';
  }
}

/**
 * Local workspace MCP config adapter
 * Uses: mcpServers key, limps command, client-specific local config paths
 *
 * Default paths by client:
 * - Cursor: .cursor/mcp.json
 * - Claude Code: .mcp.json
 * - Custom: user-specified path
 */
export class LocalMcpAdapter implements McpClientAdapter {
  private configPath: string;
  private clientType: LocalMcpClientType;

  constructor(clientType: LocalMcpClientType = 'claude-code', customPath?: string) {
    this.clientType = clientType;
    this.configPath = getLocalConfigPath(clientType, customPath);
  }

  getConfigPath(): string {
    return this.configPath;
  }

  getServersKey(): string {
    // OpenCode nests MCP servers under "mcp"; all other local clients use "mcpServers"
    return this.clientType === 'opencode' ? 'mcp' : 'mcpServers';
  }

  createHttpServerConfig(host: string, port: number): McpServerConfig {
    return {
      transport: {
        type: 'http',
        url: `http://${host}:${port}/mcp`,
      },
    };
  }

  getDisplayName(): string {
    return getLocalConfigDisplayName(this.clientType);
  }

  getClientType(): LocalMcpClientType {
    return this.clientType;
  }
}

/**
 * Global adapter client types (write to global config locations)
 */
export type GlobalAdapterClientType = 'claude' | 'cursor' | 'claude-code' | 'codex';

/**
 * Get adapter for a global client type
 */
export function getAdapter(clientType: GlobalAdapterClientType): McpClientAdapter {
  switch (clientType) {
    case 'claude':
      return new ClaudeDesktopAdapter();
    case 'cursor':
      return new CursorAdapter();
    case 'claude-code':
      return new ClaudeCodeAdapter();
    case 'codex':
      return new CodexAdapter();
    default:
      throw new Error(`Unknown client type: ${clientType}`);
  }
}

/**
 * Get a local adapter for a specific client type
 */
export function getLocalAdapter(
  clientType: LocalMcpClientType,
  customPath?: string
): LocalMcpAdapter {
  return new LocalMcpAdapter(clientType, customPath);
}
