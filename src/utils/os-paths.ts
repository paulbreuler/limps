/**
 * OS-specific path resolution utilities for global npm installation.
 * Provides default configuration and data paths based on the operating system.
 */

import { homedir } from 'os';
import { join } from 'path';

const APP_NAME = 'mcp-planning-server';

/**
 * Get the OS-specific default configuration file path.
 *
 * - macOS: ~/Library/Application Support/mcp-planning-server/config.json
 * - Windows: %APPDATA%\mcp-planning-server\config.json
 * - Linux/others: ~/.config/mcp-planning-server/config.json (XDG_CONFIG_HOME)
 *
 * @returns Absolute path to the default config file location
 */
export function getOSConfigPath(): string {
  const home = homedir();

  switch (process.platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', APP_NAME, 'config.json');
    case 'win32':
      return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), APP_NAME, 'config.json');
    default:
      // Linux and other Unix-like systems follow XDG Base Directory Specification
      return join(process.env.XDG_CONFIG_HOME || join(home, '.config'), APP_NAME, 'config.json');
  }
}

/**
 * Get the OS-specific default data directory path.
 *
 * - macOS: ~/Library/Application Support/mcp-planning-server/data
 * - Windows: %APPDATA%\mcp-planning-server\data
 * - Linux/others: ~/.local/share/mcp-planning-server/data (XDG_DATA_HOME)
 *
 * @returns Absolute path to the default data directory
 */
export function getOSDataPath(): string {
  const home = homedir();

  switch (process.platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', APP_NAME, 'data');
    case 'win32':
      return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), APP_NAME, 'data');
    default:
      // Linux and other Unix-like systems follow XDG Base Directory Specification
      return join(process.env.XDG_DATA_HOME || join(home, '.local', 'share'), APP_NAME, 'data');
  }
}

/**
 * Get the OS-specific default coordination file path.
 *
 * - macOS: ~/Library/Application Support/mcp-planning-server/coordination.json
 * - Windows: %APPDATA%\mcp-planning-server\coordination.json
 * - Linux/others: ~/.local/share/mcp-planning-server/coordination.json (XDG_DATA_HOME)
 *
 * @returns Absolute path to the default coordination file
 */
export function getOSCoordinationPath(): string {
  const home = homedir();

  switch (process.platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', APP_NAME, 'coordination.json');
    case 'win32':
      return join(
        process.env.APPDATA || join(home, 'AppData', 'Roaming'),
        APP_NAME,
        'coordination.json'
      );
    default:
      return join(
        process.env.XDG_DATA_HOME || join(home, '.local', 'share'),
        APP_NAME,
        'coordination.json'
      );
  }
}
