/**
 * Configuration path resolution utility.
 * Shared between CLI commands and server startup.
 */

import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { getCurrentProjectPath, getProjectPath } from '../cli/registry.js';
import { getOSConfigPath } from './os-paths.js';

/**
 * Resolve configuration file path with priority:
 * 1. CLI argument --config
 * 2. Environment variable MCP_PLANNING_CONFIG
 * 3. Environment variable LIMPS_PROJECT (project name → registry lookup)
 * 4. Registry current project
 * 5. OS-specific default path
 *
 * Falls back to repo-local config.json if no config exists at determined path.
 *
 * @param cliConfigPath - Config path from CLI argument (if provided)
 * @returns Resolved absolute path to config file
 */
export function resolveConfigPath(cliConfigPath?: string): string {
  // Priority 1: CLI argument
  if (cliConfigPath) {
    return resolve(cliConfigPath);
  }

  // Priority 2: Environment variable MCP_PLANNING_CONFIG
  const envConfigPath = process.env.MCP_PLANNING_CONFIG;
  if (envConfigPath) {
    return resolve(envConfigPath);
  }

  // Priority 3: LIMPS_PROJECT env → registry lookup
  const envProject = process.env.LIMPS_PROJECT;
  if (envProject) {
    const projectPath = getProjectPath(envProject);
    if (projectPath && existsSync(projectPath)) {
      return projectPath;
    }
    // Warn but don't fail - fall through to next priority
    console.error(`Warning: LIMPS_PROJECT="${envProject}" not found in registry`);
  }

  // Priority 4: Registry current project
  const currentPath = getCurrentProjectPath();
  if (currentPath && existsSync(currentPath)) {
    return currentPath;
  }

  // Priority 5: OS-specific default
  const osConfigPath = getOSConfigPath();
  if (existsSync(osConfigPath)) {
    return osConfigPath;
  }

  // Fallback: repo-local config.json (for development/backwards compatibility)
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  const srcDir = dirname(currentDir);
  const repoRoot = dirname(srcDir);
  const repoConfigPath = resolve(repoRoot, 'config.json');

  // If neither OS config nor repo config exists, use OS path (will be created)
  if (existsSync(repoConfigPath)) {
    return repoConfigPath;
  }

  return osConfigPath;
}
