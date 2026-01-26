/**
 * Config subcommand handlers for limps CLI.
 * Provides commands to manage the project registry and view configuration.
 */

import { existsSync, readdirSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import {
  registerProject,
  unregisterProject,
  setCurrentProject,
  listProjects,
  loadRegistry,
} from './registry.js';
import { loadConfig } from '../config.js';

/**
 * Project data for JSON output.
 */
export interface ProjectsData {
  projects: {
    name: string;
    configPath: string;
    current: boolean;
    exists: boolean;
  }[];
  total: number;
}

/**
 * Get projects data for JSON output.
 *
 * @returns Projects data object
 */
export function getProjectsData(): ProjectsData {
  const projects = listProjects();

  return {
    projects: projects.map((p) => ({
      name: p.name,
      configPath: p.configPath,
      current: p.current,
      exists: existsSync(p.configPath),
    })),
    total: projects.length,
  };
}

/**
 * List all registered projects.
 *
 * @returns Formatted list of projects
 */
export function configList(): string {
  const projects = listProjects();

  if (projects.length === 0) {
    return 'No projects registered. Run `limps init <name>` to create one.';
  }

  const lines: string[] = [];
  lines.push('CURRENT  NAME                 PATH');
  lines.push('-------  -------------------  ----');

  for (const project of projects) {
    const current = project.current ? '*' : ' ';
    const name = project.name.padEnd(19);
    const exists = existsSync(project.configPath) ? '' : ' (missing)';
    lines.push(`   ${current}     ${name}  ${project.configPath}${exists}`);
  }

  return lines.join('\n');
}

/**
 * Switch to a different project.
 *
 * @param name - Project name to switch to
 * @returns Success message
 * @throws Error if project not found
 */
export function configUse(name: string): string {
  setCurrentProject(name);
  return `Switched to project "${name}"`;
}

/**
 * Configuration data for JSON output.
 */
export interface ConfigData {
  configPath: string;
  config: {
    plansPath: string;
    dataPath: string;
    docsPaths?: string[];
    fileExtensions?: string[];
  };
}

/**
 * Get configuration data for JSON output.
 *
 * @param resolveConfigPathFn - Function to resolve config path (injected to avoid circular deps)
 * @returns Configuration data object
 * @throws Error if config file not found
 */
export function getConfigData(resolveConfigPathFn: () => string): ConfigData {
  const configPath = resolveConfigPathFn();

  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const config = loadConfig(configPath);

  return {
    configPath,
    config: {
      plansPath: config.plansPath,
      dataPath: config.dataPath,
      docsPaths: config.docsPaths,
      fileExtensions: config.fileExtensions,
    },
  };
}

/**
 * Show the resolved configuration values.
 *
 * @param resolveConfigPathFn - Function to resolve config path (injected to avoid circular deps)
 * @returns Formatted configuration
 */
export function configShow(resolveConfigPathFn: () => string): string {
  const configPath = resolveConfigPathFn();

  if (!existsSync(configPath)) {
    return `Config file not found: ${configPath}\n\nRun \`limps init <name>\` to create a project.`;
  }

  const config = loadConfig(configPath);

  const lines: string[] = [];
  lines.push(`Config file: ${configPath}`);
  lines.push('');
  lines.push('Configuration:');
  lines.push(`  plansPath:          ${config.plansPath}`);
  lines.push(`  dataPath:           ${config.dataPath}`);

  if (config.docsPaths && config.docsPaths.length > 0) {
    lines.push(`  docsPaths:`);
    for (const p of config.docsPaths) {
      lines.push(`    - ${p}`);
    }
  }

  if (config.fileExtensions) {
    lines.push(`  fileExtensions:     ${config.fileExtensions.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Print the resolved config file path.
 *
 * @param resolveConfigPathFn - Function to resolve config path (injected to avoid circular deps)
 * @returns The config path
 */
export function configPath(resolveConfigPathFn: () => string): string {
  return resolveConfigPathFn();
}

/**
 * Add/register an existing config file to the registry.
 *
 * @param name - Project name to use
 * @param configFilePath - Path to the config file
 * @returns Success message
 * @throws Error if config file doesn't exist
 */
export function configAdd(name: string, configFilePath: string): string {
  const absolutePath = resolve(configFilePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`);
  }

  // Validate it's a valid config file
  try {
    loadConfig(absolutePath);
  } catch (error) {
    throw new Error(
      `Invalid config file: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  registerProject(name, absolutePath);
  return `Registered project "${name}" with config: ${absolutePath}`;
}

/**
 * Remove a project from the registry.
 * Does not delete any files.
 *
 * @param name - Project name to remove
 * @returns Success message
 * @throws Error if project not found
 */
export function configRemove(name: string): string {
  unregisterProject(name);
  return `Removed project "${name}" from registry (files not deleted)`;
}

/**
 * Set the current project from an existing config file path.
 * Auto-derives the project name from the parent directory.
 * Registers the project if not already registered.
 *
 * @param configFilePath - Path to the config file
 * @returns Success message
 * @throws Error if config file doesn't exist or is invalid
 */
export function configSet(configFilePath: string): string {
  const absolutePath = resolve(configFilePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`);
  }

  // Validate it's a valid config file
  try {
    loadConfig(absolutePath);
  } catch (error) {
    throw new Error(
      `Invalid config file: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  // Derive project name from parent directory
  const projectName = basename(dirname(absolutePath));

  // Check if already registered with this path
  const registry = loadRegistry();
  const existingEntry = Object.entries(registry.projects).find(
    ([, project]) => project.configPath === absolutePath
  );

  if (existingEntry) {
    // Already registered, just set as current
    setCurrentProject(existingEntry[0]);
    return `Switched to project "${existingEntry[0]}"`;
  }

  // Register and set as current
  registerProject(projectName, absolutePath);
  setCurrentProject(projectName);
  return `Registered and switched to project "${projectName}"`;
}

import { getOSBasePath } from '../utils/os-paths.js';

/**
 * Discover and register config files from default OS locations.
 * Scans the OS-specific application support directories for config.json files.
 *
 * @returns Summary of discovered projects
 */
export function configDiscover(): string {
  // Get the parent directory of where limps stores its config
  // This respects any mocking of getOSBasePath for testing
  const limpsBasePath = getOSBasePath('limps');
  const searchDir = dirname(limpsBasePath);

  const registry = loadRegistry();
  const registeredPaths = new Set(Object.values(registry.projects).map((p) => p.configPath));

  const discovered: { name: string; path: string }[] = [];

  if (!existsSync(searchDir)) {
    return 'No new projects discovered.';
  }

  try {
    const entries = readdirSync(searchDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const configPath = `${searchDir}/${entry.name}/config.json`;

      // Skip if already registered or doesn't exist
      if (registeredPaths.has(configPath) || !existsSync(configPath)) continue;

      // Validate it's a valid limps config
      try {
        loadConfig(configPath);
        registerProject(entry.name, configPath);
        discovered.push({ name: entry.name, path: configPath });
      } catch {
        // Not a valid limps config, skip
      }
    }
  } catch {
    // Can't read directory, skip
  }

  if (discovered.length === 0) {
    return 'No new projects discovered.';
  }

  const lines = [`Discovered ${discovered.length} project(s):`, ''];
  for (const { name, path } of discovered) {
    lines.push(`  ${name}: ${path}`);
  }
  lines.push('');
  lines.push('Run `limps config use <name>` to switch to a project.');

  return lines.join('\n');
}
