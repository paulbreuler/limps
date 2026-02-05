/**
 * MCP Client Configuration Adapters
 * Provides loosely coupled adapters for different MCP clients (Claude Desktop, Cursor, etc.)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import * as toml from '@iarna/toml';
import * as _jsonc from 'jsonc-parser';

/**
 * MCP server configuration entry
 */
export interface McpServerConfig {
  command: string;
  args: string[];
}

/**
 * MCP client config structure
 */
export type McpClientConfig = Record<string, McpServerConfig | unknown>;

/**
 * Adapter interface for MCP client configurations
 */
export interface McpClientAdapter {
  /** Get the config file path for this client */
  getConfigPath(): string;

  /** Get the key name for the servers object (e.g., "mcpServers" or "mcp.servers") */
  getServersKey(): string;

  /** Whether the servers key should be treated as a flat key or nested path (default: nested) */
  useFlatKey?(): boolean;

  /** Read the config file */
  readConfig(): McpClientConfig;

  /** Write the config file */
  writeConfig(config: McpClientConfig): void;

  /** Create server config for a limps project */
  createServerConfig(configPath: string): McpServerConfig;

  /** Get display name for this client */
  getDisplayName(): string;
}

/**
 * Claude Desktop adapter
 * Uses: mcpServers key, npx command, ~/Library/Application Support/Claude/claude_desktop_config.json
 */
export class ClaudeDesktopAdapter implements McpClientAdapter {
  getConfigPath(): string {
    const home = homedir();
    return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }

  getServersKey(): string {
    return 'mcpServers';
  }

  readConfig(): McpClientConfig {
    const configPath = this.getConfigPath();
    const configDir = dirname(configPath);

    // Ensure directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Read existing config or return empty
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        return JSON.parse(content) as McpClientConfig;
      } catch (error) {
        throw new Error(
          `Failed to parse Claude Desktop config: ${error instanceof Error ? error.message : 'unknown error'}`
        );
      }
    }

    return {};
  }

  writeConfig(config: McpClientConfig): void {
    const configPath = this.getConfigPath();
    const configDir = dirname(configPath);

    // Ensure directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    try {
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to write Claude Desktop config: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }

  createServerConfig(configPath: string): McpServerConfig {
    return {
      command: 'npx',
      args: ['-y', '@sudosandwich/limps', 'serve', '--config', configPath],
    };
  }

  getDisplayName(): string {
    return 'Claude Desktop';
  }
}

/**
 * Cursor adapter
 * Uses: mcp.servers key, limps command, VS Code settings.json location
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

  readConfig(): McpClientConfig {
    const configPath = this.getConfigPath();
    const configDir = dirname(configPath);

    // Ensure directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Read existing config or return empty
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        return JSON.parse(content) as McpClientConfig;
      } catch (error) {
        throw new Error(
          `Failed to parse Cursor settings: ${error instanceof Error ? error.message : 'unknown error'}`
        );
      }
    }

    return {};
  }

  writeConfig(config: McpClientConfig): void {
    const configPath = this.getConfigPath();
    const configDir = dirname(configPath);

    // Ensure directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    try {
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to write Cursor settings: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }

  createServerConfig(configPath: string): McpServerConfig {
    // Cursor can use the global limps command directly
    // Try to find limps in PATH, fallback to 'limps'
    return {
      command: 'limps',
      args: ['serve', '--config', configPath],
    };
  }

  getDisplayName(): string {
    return 'Cursor';
  }
}

/**
 * Claude Code adapter
 * Uses: mcpServers key, npx command, ~/.claude.json (user scope)
 */
export class ClaudeCodeAdapter implements McpClientAdapter {
  getConfigPath(): string {
    const home = homedir();
    return join(home, '.claude.json');
  }

  getServersKey(): string {
    return 'mcpServers';
  }

  readConfig(): McpClientConfig {
    const configPath = this.getConfigPath();
    const configDir = dirname(configPath);

    // Ensure directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Read existing config or return empty
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        return JSON.parse(content) as McpClientConfig;
      } catch (error) {
        throw new Error(
          `Failed to parse Claude Code config: ${error instanceof Error ? error.message : 'unknown error'}`
        );
      }
    }

    return {};
  }

  writeConfig(config: McpClientConfig): void {
    const configPath = this.getConfigPath();
    const configDir = dirname(configPath);

    // Ensure directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    try {
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to write Claude Code config: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }

  createServerConfig(configPath: string): McpServerConfig {
    return {
      command: 'npx',
      args: ['-y', '@sudosandwich/limps', 'serve', '--config', configPath],
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

  readConfig(): McpClientConfig {
    const configPath = this.getConfigPath();
    const configDir = dirname(configPath);

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        return toml.parse(content) as McpClientConfig;
      } catch (error) {
        throw new Error(
          `Failed to parse Codex config: ${error instanceof Error ? error.message : 'unknown error'}`
        );
      }
    }

    return {};
  }

  writeConfig(config: McpClientConfig): void {
    const configPath = this.getConfigPath();
    const configDir = dirname(configPath);

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    try {
      const content = toml.stringify(config as unknown as toml.JsonMap);
      writeFileSync(configPath, content, 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to write Codex config: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }

  createServerConfig(configPath: string): McpServerConfig {
    return {
      command: 'limps',
      args: ['serve', '--config', configPath],
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
    return 'mcpServers';
  }

  readConfig(): McpClientConfig {
    const configPath = this.getConfigPath();

    // Read existing config or return empty
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        return JSON.parse(content) as McpClientConfig;
      } catch (error) {
        throw new Error(
          `Failed to parse ${this.getDisplayName()}: ${error instanceof Error ? error.message : 'unknown error'}`
        );
      }
    }

    return {};
  }

  writeConfig(config: McpClientConfig): void {
    const configPath = this.getConfigPath();
    const configDir = dirname(configPath);

    // Ensure directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    try {
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to write ${this.getDisplayName()}: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }

  createServerConfig(configPath: string): McpServerConfig {
    // Local configs can use the global limps command
    return {
      command: 'limps',
      args: ['serve', '--config', configPath],
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
 * All adapter client types including local
 */
export type AdapterClientType = GlobalAdapterClientType | 'local';

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

/**
 * Check if a client type supports local workspace configs
 */
export function supportsLocalConfig(
  clientType: string
): clientType is 'cursor' | 'claude-code' | 'opencode' {
  return clientType === 'cursor' || clientType === 'claude-code' || clientType === 'opencode';
}
