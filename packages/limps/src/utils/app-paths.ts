import { homedir } from 'os';
import { join } from 'path';

/**
 * Get OS-specific application data directory.
 * - macOS: ~/Library/Application Support/limps
 * - Windows: %APPDATA%/limps
 * - Linux: $XDG_DATA_HOME/limps or ~/.local/share/limps
 */
export function getAppDataPath(): string {
  const home = homedir();

  switch (process.platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'limps');
    case 'win32':
      return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'limps');
    default:
      return join(process.env.XDG_DATA_HOME || join(home, '.local', 'share'), 'limps');
  }
}

/**
 * Get OS-specific cache directory.
 * - macOS: ~/Library/Caches/limps
 * - Windows: %LOCALAPPDATA%/limps
 * - Linux: $XDG_CACHE_HOME/limps or ~/.cache/limps
 */
export function getCachePath(): string {
  const home = homedir();

  switch (process.platform) {
    case 'darwin':
      return join(home, 'Library', 'Caches', 'limps');
    case 'win32':
      return join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'limps');
    default:
      return join(process.env.XDG_CACHE_HOME || join(home, '.cache'), 'limps');
  }
}
