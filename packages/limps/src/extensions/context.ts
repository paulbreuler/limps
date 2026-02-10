import { mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { ExtensionContext, Logger } from './types.js';
import type { ServerConfig } from '../config.js';
import { sanitizeOperationalMessage } from '../utils/safe-logging.js';

/**
 * Simple console-based logger implementation.
 */
class ConsoleLogger implements Logger {
  error(message: string, ..._args: unknown[]): void {
    // Never persist extension-provided args because they may include prompt/response payloads.
    console.error(`[extension] ${sanitizeOperationalMessage(message)}`);
  }

  warn(message: string, ..._args: unknown[]): void {
    console.error(`[extension] WARN: ${sanitizeOperationalMessage(message)}`);
  }

  info(message: string, ..._args: unknown[]): void {
    console.error(`[extension] ${sanitizeOperationalMessage(message)}`);
  }

  debug(message: string, ..._args: unknown[]): void {
    // Only log debug in development
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[extension] DEBUG: ${sanitizeOperationalMessage(message)}`);
    }
  }
}

/**
 * Create extension context for an extension.
 * Extension-specific config is read from config[extensionName] (e.g. config['limps-headless']).
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
