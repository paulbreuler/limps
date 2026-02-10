/**
 * Configuration path resolution utility.
 * Shared between CLI commands and server startup.
 */

import { resolve, dirname } from 'path';
import { existsSync } from 'fs';

/**
 * Find .limps/config.json by walking up the directory tree from startDir.
 *
 * @param startDir - Directory to start searching from (defaults to cwd)
 * @returns Absolute path to config file, or null if not found
 */
function findLocalConfig(startDir: string = process.cwd()): string | null {
  let currentDir = resolve(startDir);
  const root = resolve('/');

  while (currentDir !== root) {
    const configPath = resolve(currentDir, '.limps', 'config.json');
    if (existsSync(configPath)) {
      return configPath;
    }
    currentDir = dirname(currentDir);
  }

  // Check root directory as well
  const rootConfigPath = resolve(root, '.limps', 'config.json');
  if (existsSync(rootConfigPath)) {
    return rootConfigPath;
  }

  return null;
}

/**
 * Resolve configuration file path with priority:
 * 1. CLI argument --config
 * 2. Environment variable MCP_PLANNING_CONFIG
 * 3. Local .limps/config.json (searches up directory tree from cwd)
 *
 * Throws if no config source is found.
 *
 * @param cliConfigPath - Config path from CLI argument (if provided)
 * @returns Resolved absolute path to config file
 * @throws Error if no configuration source is found
 */
export function resolveConfigPath(cliConfigPath?: string): string {
  // Priority 1: CLI argument
  if (cliConfigPath) {
    const resolvedPath = resolve(cliConfigPath);
    if (!existsSync(resolvedPath)) {
      const parentDir = dirname(resolvedPath);
      if (!existsSync(parentDir)) {
        throw new Error(`Config directory not found: ${parentDir}`);
      }
    }
    return resolvedPath;
  }

  // Priority 2: Environment variable MCP_PLANNING_CONFIG
  const envConfigPath = process.env.MCP_PLANNING_CONFIG;
  if (envConfigPath) {
    return resolve(envConfigPath);
  }

  // Priority 3: Local .limps/config.json (walk up directory tree from cwd)
  const cwd = process.cwd();
  const localConfig = findLocalConfig(cwd);
  if (localConfig) {
    return localConfig;
  }

  // No config found — require explicit configuration
  throw new Error(
    `No config found. Searched from: ${cwd}\n` +
      `Run \`limps init\`, use \`--config <path>\`, or set MCP_PLANNING_CONFIG.`
  );
}
