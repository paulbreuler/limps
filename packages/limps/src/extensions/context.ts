import { mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { ExtensionContext, Logger } from './types.js';
import type { ServerConfig } from '../config.js';

/**
 * Simple console-based logger implementation.
 */
class ConsoleLogger implements Logger {
  error(message: string, ...args: unknown[]): void {
    console.error(`[extension] ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.error(`[extension] WARN: ${message}`, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    console.error(`[extension] ${message}`, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    // Only log debug in development
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[extension] DEBUG: ${message}`, ...args);
    }
  }
}

/**
 * Create extension context for an extension.
 *
 * @param extensionName - Name of the extension (e.g., 'limps-headless')
 * @param config - Server configuration
 * @returns Extension context with dataDir, config, and logger
 */
export function createExtensionContext(
  extensionName: string,
  config: ServerConfig
): ExtensionContext {
  // Expand ~ to home directory
  const expandTilde = (path: string): string => {
    if (path.startsWith('~/') || path === '~') {
      return path.replace(/^~/, homedir());
    }
    return path;
  };

  // Extension data directory: ~/.limps/extensions/{name}/
  const baseDataDir = expandTilde('~/.limps');
  const extensionDataDir = join(baseDataDir, 'extensions', extensionName);

  // Ensure directory exists
  mkdirSync(extensionDataDir, { recursive: true });

  // Get extension-specific config from limps.config.json
  // Config is stored under the extension name key
  const extensionConfig = (config as unknown as Record<string, unknown>)[extensionName] as
    | Record<string, unknown>
    | undefined;

  const logger = new ConsoleLogger();

  return {
    dataDir: extensionDataDir,
    config: extensionConfig || {},
    logger,
  };
}
