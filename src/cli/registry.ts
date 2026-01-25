/**
 * Project registry for managing limps configurations.
 * Stores a mapping of project names to config paths, enabling
 * users to switch between projects without specifying --config each time.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { dirname } from 'path';
import { getOSBasePath } from '../utils/os-paths.js';

/**
 * A registered project entry in the registry.
 */
export interface RegisteredProject {
  /** Absolute path to the project's config.json file */
  configPath: string;
  /** ISO timestamp when the project was registered */
  registeredAt: string;
}

/**
 * The project registry file structure.
 */
export interface ProjectRegistry {
  /** Schema version for future migrations */
  version: 1;
  /** Currently active project name, or null if none set */
  current: string | null;
  /** Map of project names to their registration info */
  projects: Record<string, RegisteredProject>;
}

/**
 * Get the path to the registry file.
 * Uses XDG-compliant location: ~/.config/limps/registry.json
 *
 * @returns Absolute path to registry.json
 */
export function getRegistryPath(): string {
  return `${getOSBasePath('limps')}/registry.json`;
}

/**
 * Load the project registry from disk.
 * Returns an empty registry if the file doesn't exist.
 *
 * @returns The project registry
 */
export function loadRegistry(): ProjectRegistry {
  const path = getRegistryPath();
  if (!existsSync(path)) {
    return { version: 1, current: null, projects: {} };
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const registry = JSON.parse(content) as ProjectRegistry;

    // Validate basic structure
    if (!registry.version || !registry.projects) {
      console.error('Warning: Corrupt registry file, resetting to empty');
      return { version: 1, current: null, projects: {} };
    }

    return registry;
  } catch (_error) {
    console.error('Warning: Failed to parse registry file, resetting to empty');
    return { version: 1, current: null, projects: {} };
  }
}

/**
 * Save the project registry to disk.
 * Uses atomic write (write to temp, then rename) to prevent corruption.
 *
 * @param registry - The registry to save
 */
export function saveRegistry(registry: ProjectRegistry): void {
  const path = getRegistryPath();
  mkdirSync(dirname(path), { recursive: true });

  // Atomic write: write to temp file, then rename
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(registry, null, 2));
  renameSync(tmp, path);
}

/**
 * Register a new project in the registry.
 *
 * @param name - Project name (used as identifier)
 * @param configPath - Absolute path to the project's config.json
 */
export function registerProject(name: string, configPath: string): void {
  const registry = loadRegistry();
  registry.projects[name] = {
    configPath,
    registeredAt: new Date().toISOString(),
  };
  saveRegistry(registry);
}

/**
 * Unregister a project from the registry.
 * If the project is the current project, clears the current selection.
 * Does not delete any files, only removes the registry entry.
 *
 * @param name - Project name to unregister
 * @throws Error if the project is not registered
 */
export function unregisterProject(name: string): void {
  const registry = loadRegistry();

  if (!registry.projects[name]) {
    throw new Error(`Project not found: ${name}`);
  }

  // Clear current if this was the active project
  if (registry.current === name) {
    registry.current = null;
  }

  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete registry.projects[name];
  saveRegistry(registry);
}

/**
 * Set the current/default project.
 *
 * @param name - Project name to set as current, or null to clear
 * @throws Error if the project is not registered
 */
export function setCurrentProject(name: string | null): void {
  const registry = loadRegistry();

  if (name !== null && !registry.projects[name]) {
    throw new Error(
      `Project not found: ${name}\nRun \`limps config list\` to see available projects.`
    );
  }

  registry.current = name;
  saveRegistry(registry);
}

/**
 * Get the config path for the current project.
 *
 * @returns Config path if a current project is set and exists, null otherwise
 */
export function getCurrentProjectPath(): string | null {
  const registry = loadRegistry();

  if (!registry.current) {
    return null;
  }

  const project = registry.projects[registry.current];
  if (!project) {
    return null;
  }

  return project.configPath;
}

/**
 * Get the config path for a specific project by name.
 *
 * @param name - Project name to look up
 * @returns Config path if found, null otherwise
 */
export function getProjectPath(name: string): string | null {
  const registry = loadRegistry();
  const project = registry.projects[name];
  return project?.configPath ?? null;
}

/**
 * List all registered projects.
 *
 * @returns Array of project info objects
 */
export function listProjects(): {
  name: string;
  current: boolean;
  configPath: string;
  registeredAt: string;
}[] {
  const registry = loadRegistry();

  return Object.entries(registry.projects)
    .map(([name, project]) => ({
      name,
      current: name === registry.current,
      configPath: project.configPath,
      registeredAt: project.registeredAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
