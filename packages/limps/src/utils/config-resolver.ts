/**
 * Configuration path resolution utility.
 * Shared between CLI commands and server startup.
 */

import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { getCurrentProjectPath, getProjectPath } from '../cli/registry.js';

/**
 * Resolve configuration file path with priority:
 * 1. CLI argument --config
 * 2. Environment variable MCP_PLANNING_CONFIG
 * 3. Environment variable LIMPS_PROJECT (project name → registry lookup)
 * 4. Registry current project
 *
 * Throws if no config source is found — there is no OS-level fallback.
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

  // No config found — require explicit configuration
  throw new Error(
    'No config found. Run `limps init <project>`, use `--config <path>`, or set a current project with `limps config use <name>`.'
  );
}

/**
 * Resolve a config path from a registered project name.
 *
 * @param projectName - Registered project name
 * @returns Absolute path to project config
 * @throws Error if project is not registered or path is missing
 */
export function resolveProjectConfigPath(projectName: string): string {
  const projectPath = getProjectPath(projectName);
  if (!projectPath || !existsSync(projectPath)) {
    throw new Error(
      `Project not found: ${projectName}\nRun \`limps config list\` to see available projects.`
    );
  }
  return projectPath;
}
