/**
 * Configuration path resolution utility.
 * Shared between CLI commands and server startup.
 */

import { resolve, dirname } from 'path';
import { existsSync } from 'fs';

/**
 * Resolve configuration file path with priority:
 * 1. CLI argument --config
 * 2. Environment variable MCP_PLANNING_CONFIG
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

  // No config found — require explicit configuration
  throw new Error(
    'No config found. Run `limps init`, use `--config <path>`, or set MCP_PLANNING_CONFIG.'
  );
}
