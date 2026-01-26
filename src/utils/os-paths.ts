/**
 * OS-specific path resolution utilities for global npm installation.
 * Provides default configuration and data paths based on the operating system.
 */

import { homedir } from 'os';
import { join } from 'path';

const DEFAULT_APP_NAME = 'limps';

/**
 * Get the OS-specific base directory for application data.
 *
 * @param appName - Application/project name (defaults to limps)
 * @returns Absolute path to the base directory
 */
export function getOSBasePath(appName: string = DEFAULT_APP_NAME): string {
  const home = homedir();

  switch (process.platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', appName);
    case 'win32':
      return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), appName);
    default:
      return join(process.env.XDG_CONFIG_HOME || join(home, '.config'), appName);
  }
}

/**
 * Get the OS-specific default configuration file path.
 *
 * - macOS: ~/Library/Application Support/{appName}/config.json
 * - Windows: %APPDATA%\{appName}\config.json
 * - Linux/others: ~/.config/{appName}/config.json (XDG_CONFIG_HOME)
 *
 * @param appName - Application/project name (defaults to limps)
 * @returns Absolute path to the default config file location
 */
export function getOSConfigPath(appName: string = DEFAULT_APP_NAME): string {
  return join(getOSBasePath(appName), 'config.json');
}

/**
 * Get the OS-specific default data directory path.
 *
 * - macOS: ~/Library/Application Support/{appName}/data
 * - Windows: %APPDATA%\{appName}\data
 * - Linux/others: ~/.local/share/{appName}/data (XDG_DATA_HOME)
 *
 * @param appName - Application/project name (defaults to limps)
 * @returns Absolute path to the default data directory
 */
export function getOSDataPath(appName: string = DEFAULT_APP_NAME): string {
  const home = homedir();

  switch (process.platform) {
    case 'darwin':
      return join(getOSBasePath(appName), 'data');
    case 'win32':
      return join(getOSBasePath(appName), 'data');
    default:
      // Linux: data goes to XDG_DATA_HOME, not XDG_CONFIG_HOME
      return join(process.env.XDG_DATA_HOME || join(home, '.local', 'share'), appName, 'data');
  }
}

