/**
 * MCP Client Configuration Adapters
 * Provides loosely coupled adapters for different MCP clients (Claude Desktop, Cursor, etc.)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

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
 * Uses: mcpServers key, npx command, ~/.claude/.mcp.json (user scope)
 * See: https://code.claude.com/docs/en/mcp
 */
export class ClaudeCodeAdapter implements McpClientAdapter {
  getConfigPath(): string {
    const home = homedir();
    return join(home, '.claude', '.mcp.json');
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
 * Get adapter for a client type
 */
export function getAdapter(clientType: 'claude' | 'cursor' | 'claude-code'): McpClientAdapter {
  switch (clientType) {
    case 'claude':
      return new ClaudeDesktopAdapter();
    case 'cursor':
      return new CursorAdapter();
    case 'claude-code':
      return new ClaudeCodeAdapter();
    default:
      throw new Error(`Unknown client type: ${clientType}`);
  }
}
