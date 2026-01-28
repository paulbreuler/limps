/**
 * Config subcommand handlers for limps CLI.
 * Provides commands to manage the project registry and view configuration.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'fs';
import * as jsonpatch from 'fast-json-patch';
import { resolve, dirname, basename, join } from 'path';
import * as toml from '@iarna/toml';
import {
  registerProject,
  unregisterProject,
  setCurrentProject,
  listProjects,
  loadRegistry,
} from './registry.js';
import { loadConfig } from '../config.js';
import { getOSBasePath, getOSConfigPath, getOSDataPath } from '../utils/os-paths.js';

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

  if (config.scoring?.weights || config.scoring?.biases) {
    lines.push(`  scoring:`);

    if (config.scoring.weights) {
      lines.push(`    weights:`);
      const weights = config.scoring.weights;
      if (weights.dependency !== undefined) {
        lines.push(`      dependency:     ${weights.dependency}`);
      }
      if (weights.priority !== undefined) {
        lines.push(`      priority:       ${weights.priority}`);
      }
      if (weights.workload !== undefined) {
        lines.push(`      workload:       ${weights.workload}`);
      }
    }

    if (config.scoring.biases) {
      lines.push(`    biases:`);
      const biases = config.scoring.biases;
      if (biases.plans && Object.keys(biases.plans).length > 0) {
        lines.push(`      plans:`);
        for (const [plan, value] of Object.entries(biases.plans)) {
          lines.push(`        ${plan}: ${value > 0 ? '+' : ''}${value}`);
        }
      }
      if (biases.personas) {
        lines.push(`      personas:`);
        const personas = biases.personas;
        if (personas.coder !== undefined) {
          lines.push(`        coder:        ${personas.coder > 0 ? '+' : ''}${personas.coder}`);
        }
        if (personas.reviewer !== undefined) {
          lines.push(
            `        reviewer:     ${personas.reviewer > 0 ? '+' : ''}${personas.reviewer}`
          );
        }
        if (personas.pm !== undefined) {
          lines.push(`        pm:           ${personas.pm > 0 ? '+' : ''}${personas.pm}`);
        }
        if (personas.customer !== undefined) {
          lines.push(
            `        customer:     ${personas.customer > 0 ? '+' : ''}${personas.customer}`
          );
        }
      }
      if (biases.statuses) {
        lines.push(`      statuses:`);
        const statuses = biases.statuses;
        if (statuses.GAP !== undefined) {
          lines.push(`        GAP:          ${statuses.GAP > 0 ? '+' : ''}${statuses.GAP}`);
        }
        if (statuses.WIP !== undefined) {
          lines.push(`        WIP:          ${statuses.WIP > 0 ? '+' : ''}${statuses.WIP}`);
        }
        if (statuses.BLOCKED !== undefined) {
          lines.push(`        BLOCKED:      ${statuses.BLOCKED > 0 ? '+' : ''}${statuses.BLOCKED}`);
        }
      }
    }
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
 * Add/register an existing config file or directory to the registry.
 * If a directory is provided, looks for config.json inside it or creates one
 * in the OS standard location (e.g., ~/Library/Application Support/limps/).
 *
 * @param name - Project name to use
 * @param configFileOrDirPath - Path to the config file or directory containing plans
 * @returns Success message
 * @throws Error if path doesn't exist
 */
export function configAdd(name: string, configFileOrDirPath: string): string {
  const absolutePath = resolve(configFileOrDirPath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Path not found: ${absolutePath}`);
  }

  const stats = statSync(absolutePath);

  // If it's a directory, look for config.json or create one in OS standard location
  if (stats.isDirectory()) {
    const configInDir = join(absolutePath, 'config.json');

    if (existsSync(configInDir)) {
      // Found existing config.json in directory
      try {
        loadConfig(configInDir);
      } catch (error) {
        throw new Error(
          `Invalid config file: ${error instanceof Error ? error.message : 'unknown error'}`
        );
      }
      registerProject(name, configInDir);
      return `Registered project "${name}" with config: ${configInDir}`;
    }

    // No config.json found - create one in OS standard location
    const basePath = getOSBasePath(name);
    const configPath = getOSConfigPath(name);
    const dataPath = getOSDataPath(name);

    // Check if config already exists in OS location
    if (existsSync(configPath)) {
      throw new Error(
        `Config already exists at: ${configPath}\nTo reconfigure, delete the existing config file first.`
      );
    }

    // Create base and data directories
    mkdirSync(basePath, { recursive: true });
    mkdirSync(dirname(dataPath), { recursive: true });

    // Determine plans path - use <dir>/plans if it exists, otherwise use <dir>
    const plansSubdir = join(absolutePath, 'plans');
    const plansPath = existsSync(plansSubdir) ? plansSubdir : absolutePath;

    const config = {
      configVersion: 1,
      plansPath: plansPath,
      docsPaths: [absolutePath],
      fileExtensions: ['.md'],
      dataPath: dataPath,
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    registerProject(name, configPath);

    const lines: string[] = [];
    lines.push(`Created config and registered project "${name}"`);
    lines.push(`  Config:     ${configPath}`);
    lines.push(`  Plans path: ${plansPath}`);
    lines.push(`  Docs path:  ${absolutePath}`);
    lines.push(`  Data path:  ${dataPath}`);
    return lines.join('\n');
  }

  // It's a file - validate it's a valid config file
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

import {
  getAdapter,
  LocalMcpAdapter,
  type McpClientAdapter,
  type McpClientConfig,
  type McpServerConfig,
} from './mcp-client-adapter.js';

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

/**
 * Generate MCP server configuration JSON for limps projects.
 * Returns the JSON structure that should be added to the client config.
 *
 * @param adapter - MCP client adapter
 * @param resolveConfigPathFn - Function to resolve limps config path (used for validation)
 * @param projectFilter - Optional array of project names to filter (if not provided, adds all)
 * @returns Object with servers key and the servers configuration
 * @throws Error if no valid projects found
 */
export function generateMcpClientConfig(
  adapter: McpClientAdapter,
  resolveConfigPathFn: () => string,
  projectFilter?: string[]
): {
  serversKey: string;
  servers: Record<string, McpServerConfig>;
  fullConfig: Record<string, unknown>;
} {
  // Validate that at least one config exists
  const testConfigPath = resolveConfigPathFn();
  if (!existsSync(testConfigPath)) {
    throw new Error(
      `Limps config not found: ${testConfigPath}\nRun \`limps init <name>\` to create a project first.`
    );
  }

  // Get all registered projects
  const allProjects = listProjects();

  if (allProjects.length === 0) {
    throw new Error('No projects registered. Run `limps init <name>` to create a project first.');
  }

  // Filter projects if filter is provided
  const projectsToAdd = projectFilter
    ? allProjects.filter((p) => projectFilter.includes(p.name))
    : allProjects;

  if (projectsToAdd.length === 0) {
    throw new Error(
      `No matching projects found. Available projects: ${allProjects.map((p) => p.name).join(', ')}`
    );
  }

  // Build servers configuration
  const servers: Record<string, McpServerConfig> = {};
  const missingProjects: { name: string; path: string }[] = [];

  for (const project of projectsToAdd) {
    // Skip projects with missing config files
    if (!existsSync(project.configPath)) {
      missingProjects.push({ name: project.name, path: project.configPath });
      continue;
    }

    const serverName = `limps-planning-${project.name}`;
    servers[serverName] = adapter.createServerConfig(project.configPath);
  }

  if (Object.keys(servers).length === 0) {
    const missingList =
      missingProjects.length > 0
        ? ` Missing config files: ${missingProjects.map((p) => `${p.name} (${p.path})`).join(', ')}`
        : '';
    throw new Error(
      `No valid projects to add. All projects have missing config files.${missingList}`
    );
  }

  // Build full config structure
  const serversKey = adapter.getServersKey();
  const fullConfig: Record<string, unknown> = {};

  if (adapter.useFlatKey?.()) {
    // Use the key as a flat key
    fullConfig[serversKey] = servers;
  } else {
    // Build nested structure
    const keyParts = serversKey.split('.');
    let current: Record<string, unknown> = fullConfig;
    for (let i = 0; i < keyParts.length - 1; i++) {
      current[keyParts[i]] = {};
      current = current[keyParts[i]] as Record<string, unknown>;
    }
    current[keyParts[keyParts.length - 1]] = servers;
  }

  return { serversKey, servers, fullConfig };
}

/**
 * Add limps server configuration to an MCP client config.
 * Creates the config file if it doesn't exist, or merges with existing config.
 * Adds all registered projects as separate MCP servers.
 *
 * @param adapter - MCP client adapter
 * @param resolveConfigPathFn - Function to resolve limps config path (used for validation)
 * @param projectFilter - Optional array of project names to filter (if not provided, adds all)
 * @returns Success message listing all added servers
 * @throws Error if config directory doesn't exist or can't be written
 */
function configAddMcpClient(
  adapter: McpClientAdapter,
  resolveConfigPathFn: () => string,
  projectFilter?: string[]
): string {
  // Validate that at least one config exists
  const testConfigPath = resolveConfigPathFn();
  if (!existsSync(testConfigPath)) {
    throw new Error(
      `Limps config not found: ${testConfigPath}\nRun \`limps init <name>\` to create a project first.`
    );
  }

  // Get all registered projects
  const allProjects = listProjects();

  if (allProjects.length === 0) {
    throw new Error('No projects registered. Run `limps init <name>` to create a project first.');
  }

  // Filter projects if filter is provided
  const projectsToAdd = projectFilter
    ? allProjects.filter((p) => projectFilter.includes(p.name))
    : allProjects;

  if (projectsToAdd.length === 0) {
    throw new Error(
      `No matching projects found. Available projects: ${allProjects.map((p) => p.name).join(', ')}`
    );
  }

  // Generate the config
  const { serversKey, servers } = generateMcpClientConfig(
    adapter,
    resolveConfigPathFn,
    projectFilter
  );

  // Read existing config or create new one
  const clientConfig = adapter.readConfig();

  const { addedServers, updatedServers } = applyServerUpdates(
    clientConfig,
    serversKey,
    servers,
    adapter.useFlatKey?.() ?? false
  );

  // Write back to file
  adapter.writeConfig(clientConfig);

  // Build success message
  const lines: string[] = [];
  const totalChanges = addedServers.length + updatedServers.length;

  if (totalChanges === 0) {
    lines.push(`No changes needed for ${adapter.getDisplayName()} config.`);
  } else {
    if (addedServers.length > 0) {
      lines.push(
        `Added ${addedServers.length} limps project(s) to ${adapter.getDisplayName()} config:`
      );
      for (const server of addedServers) {
        lines.push(`  + ${server}`);
      }
    }
    if (updatedServers.length > 0) {
      if (addedServers.length > 0) {
        lines.push('');
      }
      lines.push(
        `Updated ${updatedServers.length} limps project(s) in ${adapter.getDisplayName()} config:`
      );
      for (const server of updatedServers) {
        lines.push(`  ~ ${server}`);
      }
    }
  }

  lines.push('');
  lines.push(`Config location: ${adapter.getConfigPath()}`);
  if (totalChanges > 0) {
    lines.push(`Restart ${adapter.getDisplayName()} to use the updated MCP servers.`);
  }

  return lines.join('\n');
}

/**
 * Preview MCP client config changes without writing to disk.
 * Returns a formatted diff and counts of additions/updates.
 */
export function previewMcpClientConfig(
  adapter: McpClientAdapter,
  resolveConfigPathFn: () => string,
  projectFilter?: string[]
): {
  hasChanges: boolean;
  diffText: string;
  addedServers: string[];
  updatedServers: string[];
  configPath: string;
} {
  // Validate that at least one config exists
  const testConfigPath = resolveConfigPathFn();
  if (!existsSync(testConfigPath)) {
    throw new Error(
      `Limps config not found: ${testConfigPath}\nRun \`limps init <name>\` to create a project first.`
    );
  }

  // Get all registered projects
  const allProjects = listProjects();
  if (allProjects.length === 0) {
    throw new Error('No projects registered. Run `limps init <name>` to create a project first.');
  }

  // Filter projects if filter is provided
  const projectsToAdd = projectFilter
    ? allProjects.filter((p) => projectFilter.includes(p.name))
    : allProjects;

  if (projectsToAdd.length === 0) {
    throw new Error(
      `No matching projects found. Available projects: ${allProjects.map((p) => p.name).join(', ')}`
    );
  }

  const { serversKey, servers } = generateMcpClientConfig(
    adapter,
    resolveConfigPathFn,
    projectFilter
  );

  const originalConfig = adapter.readConfig();
  const nextConfig = deepCloneConfig(originalConfig);

  const { addedServers, updatedServers } = applyServerUpdates(
    nextConfig,
    serversKey,
    servers,
    adapter.useFlatKey?.() ?? false
  );

  const patch = jsonpatch.compare(originalConfig, nextConfig);
  const diffText = patch.length > 0 ? JSON.stringify(patch, null, 2) : '';

  return {
    hasChanges: patch.length > 0,
    diffText,
    addedServers,
    updatedServers,
    configPath: adapter.getConfigPath(),
  };
}

function deepCloneConfig(config: McpClientConfig): McpClientConfig {
  return JSON.parse(JSON.stringify(config)) as McpClientConfig;
}

function applyServerUpdates(
  clientConfig: McpClientConfig,
  serversKey: string,
  servers: Record<string, McpServerConfig>,
  useFlatKey: boolean
): { addedServers: string[]; updatedServers: string[] } {
  // Get or create the servers object
  let existingServers: Record<string, unknown>;

  if (useFlatKey) {
    // Use the key as a flat key (e.g., "mcp.servers" as a literal key)
    if (clientConfig[serversKey] && typeof clientConfig[serversKey] !== 'object') {
      throw new Error(`Invalid "${serversKey}" value: expected an object.`);
    }
    if (!clientConfig[serversKey] || typeof clientConfig[serversKey] !== 'object') {
      clientConfig[serversKey] = {};
    }
    existingServers = clientConfig[serversKey] as Record<string, unknown>;
  } else {
    // Handle nested keys like "mcp.servers" -> { mcp: { servers: {...} } }
    const keyParts = serversKey.split('.');
    let current: Record<string, unknown> = clientConfig as Record<string, unknown>;

    // Navigate/create nested structure
    for (let i = 0; i < keyParts.length - 1; i++) {
      const part = keyParts[i];
      if (current[part] && typeof current[part] !== 'object') {
        throw new Error(
          `Invalid "${keyParts.slice(0, i + 1).join('.')}" value: expected an object.`
        );
      }
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    // Get or create the final servers object
    const finalKey = keyParts[keyParts.length - 1];
    if (current[finalKey] && typeof current[finalKey] !== 'object') {
      throw new Error(`Invalid "${serversKey}" value: expected an object.`);
    }
    if (!current[finalKey] || typeof current[finalKey] !== 'object') {
      current[finalKey] = {};
    }
    existingServers = current[finalKey] as Record<string, unknown>;
  }

  // Track what was added/updated
  const addedServers: string[] = [];
  const updatedServers: string[] = [];

  for (const [serverName, serverConfig] of Object.entries(servers)) {
    const wasExisting = serverName in existingServers;
    existingServers[serverName] = serverConfig;
    if (wasExisting) {
      updatedServers.push(serverName);
    } else {
      addedServers.push(serverName);
    }
  }

  return { addedServers, updatedServers };
}

/**
 * Generate config JSON for printing (for unsupported clients).
 *
 * @param adapter - MCP client adapter
 * @param resolveConfigPathFn - Function to resolve limps config path (used for validation)
 * @param projectFilter - Optional array of project names to filter (if not provided, adds all)
 * @returns JSON string and instructions
 */
export function generateConfigForPrint(
  adapter: McpClientAdapter,
  resolveConfigPathFn: () => string,
  projectFilter?: string[]
): string {
  const { fullConfig, serversKey } = generateMcpClientConfig(
    adapter,
    resolveConfigPathFn,
    projectFilter
  );

  const isTomlConfig = adapter.getConfigPath().endsWith('.toml');
  const formattedConfig = isTomlConfig
    ? toml.stringify(fullConfig as unknown as toml.JsonMap)
    : JSON.stringify(fullConfig, null, 2);

  const lines: string[] = [];
  lines.push(`\n${adapter.getDisplayName()} Configuration:`);
  lines.push(`\nAdd this to your ${adapter.getDisplayName()} config file:`);
  lines.push(`\n${formattedConfig}`);
  lines.push(`\nConfig file location: ${adapter.getConfigPath()}`);
  lines.push(`\nNote: Merge the "${serversKey}" section into your existing config file.`);

  return lines.join('\n');
}

/**
 * Add limps server configuration to Claude Desktop config.
 * Creates the config file if it doesn't exist, or merges with existing config.
 * Adds all registered projects as separate MCP servers.
 *
 * @param resolveConfigPathFn - Function to resolve limps config path (used for validation)
 * @param projectFilter - Optional array of project names to filter (if not provided, adds all)
 * @returns Success message listing all added servers
 * @throws Error if Claude Desktop config directory doesn't exist or can't be written
 */
export function configAddClaude(
  resolveConfigPathFn: () => string,
  projectFilter?: string[]
): string {
  const adapter = getAdapter('claude');
  return configAddMcpClient(adapter, resolveConfigPathFn, projectFilter);
}

/**
 * Add limps server configuration to Cursor config.
 * Creates the config file if it doesn't exist, or merges with existing config.
 * Adds all registered projects as separate MCP servers.
 *
 * @param resolveConfigPathFn - Function to resolve limps config path (used for validation)
 * @param projectFilter - Optional array of project names to filter (if not provided, adds all)
 * @returns Success message listing all added servers
 * @throws Error if Cursor config directory doesn't exist or can't be written
 */
export function configAddCursor(
  resolveConfigPathFn: () => string,
  projectFilter?: string[]
): string {
  const adapter = getAdapter('cursor');
  return configAddMcpClient(adapter, resolveConfigPathFn, projectFilter);
}

/**
 * Add limps server configuration to Claude Code config.
 * Creates the config file if it doesn't exist, or merges with existing config.
 * Adds all registered projects as separate MCP servers.
 *
 * @param resolveConfigPathFn - Function to resolve limps config path (used for validation)
 * @param projectFilter - Optional array of project names to filter (if not provided, adds all)
 * @returns Success message listing all added servers
 * @throws Error if Claude Code config directory doesn't exist or can't be written
 */
export function configAddClaudeCode(
  resolveConfigPathFn: () => string,
  projectFilter?: string[]
): string {
  const adapter = getAdapter('claude-code');
  return configAddMcpClient(adapter, resolveConfigPathFn, projectFilter);
}

/**
 * Add limps server configuration to OpenAI Codex config.
 * Creates the config file if it doesn't exist, or merges with existing config.
 * Adds all registered projects as separate MCP servers.
 *
 * @param resolveConfigPathFn - Function to resolve limps config path (used for validation)
 * @param projectFilter - Optional array of project names to filter (if not provided, adds all)
 * @returns Success message listing all added servers
 * @throws Error if Codex config directory doesn't exist or can't be written
 */
export function configAddCodex(
  resolveConfigPathFn: () => string,
  projectFilter?: string[]
): string {
  const adapter = getAdapter('codex');
  return configAddMcpClient(adapter, resolveConfigPathFn, projectFilter);
}

/**
 * Add/update limps server configuration to local workspace .mcp.json file.
 * Creates the config file if it doesn't exist, or merges with existing config.
 * Adds all registered projects as separate MCP servers.
 *
 * @param resolveConfigPathFn - Function to resolve limps config path (used for validation)
 * @param projectFilter - Optional array of project names to filter (if not provided, adds all)
 * @param mcpJsonPath - Optional path to .mcp.json (defaults to .mcp.json in current directory)
 * @returns Success message listing all added servers
 * @throws Error if .mcp.json directory doesn't exist or can't be written
 */
export function configAddLocalMcp(
  resolveConfigPathFn: () => string,
  projectFilter?: string[],
  mcpJsonPath?: string
): string {
  // Create adapter with custom path if provided, otherwise use default
  const adapter = mcpJsonPath ? new LocalMcpAdapter(mcpJsonPath) : getAdapter('local');
  return configAddMcpClient(adapter, resolveConfigPathFn, projectFilter);
}

/**
 * Check if a local .mcp.json file exists in the current directory or specified path.
 *
 * @param mcpJsonPath - Optional path to .mcp.json (defaults to .mcp.json in current directory)
 * @returns True if the file exists, false otherwise
 */
export function hasLocalMcpJson(mcpJsonPath?: string): boolean {
  const path = mcpJsonPath || join(process.cwd(), '.mcp.json');
  return existsSync(path);
}

/**
 * Generate ChatGPT MCP connector setup instructions.
 * ChatGPT does not read local config files, so we provide manual steps instead.
 *
 * @param resolveConfigPathFn - Function to resolve limps config path (used for validation)
 * @param projectFilter - Optional array of project names to filter (if not provided, adds all)
 * @returns Instruction text for ChatGPT custom connectors
 */
export function generateChatGptInstructions(
  resolveConfigPathFn: () => string,
  projectFilter?: string[]
): string {
  const testConfigPath = resolveConfigPathFn();
  if (!existsSync(testConfigPath)) {
    throw new Error(
      `Limps config not found: ${testConfigPath}\nRun \`limps init <name>\` to create a project first.`
    );
  }

  const allProjects = listProjects();
  if (allProjects.length === 0) {
    throw new Error('No projects registered. Run `limps init <name>` to create a project first.');
  }

  const projectsToAdd = projectFilter
    ? allProjects.filter((p) => projectFilter.includes(p.name))
    : allProjects;

  if (projectsToAdd.length === 0) {
    throw new Error(
      `No matching projects found. Available projects: ${allProjects.map((p) => p.name).join(', ')}`
    );
  }

  const validProjects = projectsToAdd.filter((p) => existsSync(p.configPath));
  if (validProjects.length === 0) {
    throw new Error('No valid projects to add. All projects have missing config files.');
  }

  const lines: string[] = [];
  lines.push('ChatGPT Custom Connector Setup (Manual)');
  lines.push('');
  lines.push(
    'ChatGPT requires a remote MCP server reachable over HTTPS. limps runs over stdio, so deploy it behind an MCP-compatible HTTP/SSE transport or proxy.'
  );
  lines.push('');
  lines.push('For each project, create a Custom Connector in ChatGPT with:');
  lines.push('');

  for (const project of validProjects) {
    lines.push(`- Project: ${project.name}`);
    lines.push(`  Server Name: limps-planning-${project.name}`);
    lines.push('  Server URL: https://your-domain.example/mcp');
    lines.push('  Authentication: (required by your deployment)');
    lines.push(`  limps command: limps serve --config ${project.configPath}`);
    lines.push('');
  }

  lines.push('Tip: create one connector per project config.');

  return lines.join('\n');
}

/**
 * Update options for configUpdate.
 */
export interface ConfigUpdateOptions {
  plansPath?: string;
  docsPath?: string;
}

/**
 * Update an existing project's configuration.
 * Allows updating plansPath and docsPaths without recreating the config.
 *
 * @param projectName - Name of the project to update
 * @param options - Fields to update
 * @returns Success message
 * @throws Error if project not found or config file doesn't exist
 */
export function configUpdate(projectName: string, options: ConfigUpdateOptions): string {
  const projects = listProjects();
  const project = projects.find((p) => p.name === projectName);

  if (!project) {
    const available = projects.map((p) => p.name).join(', ');
    throw new Error(
      `Project "${projectName}" not found.${available ? ` Available projects: ${available}` : ' No projects registered.'}`
    );
  }

  if (!existsSync(project.configPath)) {
    throw new Error(`Config file not found: ${project.configPath}`);
  }

  // Read the raw config file (not using loadConfig which resolves paths)
  const content = readFileSync(project.configPath, 'utf-8');
  const config = JSON.parse(content) as Record<string, unknown>;

  const changes: string[] = [];

  if (options.plansPath !== undefined) {
    const oldValue = config.plansPath;
    config.plansPath = options.plansPath;
    changes.push(`  plansPath: ${oldValue} → ${options.plansPath}`);
  }

  if (options.docsPath !== undefined) {
    const oldValue = config.docsPaths;
    config.docsPaths = [options.docsPath];
    changes.push(`  docsPaths: ${JSON.stringify(oldValue)} → ${JSON.stringify(config.docsPaths)}`);
  }

  if (changes.length === 0) {
    return `No changes specified. Use --plans-path or --docs-path to update configuration.`;
  }

  // Write back
  writeFileSync(project.configPath, JSON.stringify(config, null, 2));

  const lines: string[] = [];
  lines.push(`Updated project "${projectName}":`);
  lines.push('');
  lines.push(...changes);
  lines.push('');
  lines.push(`Config file: ${project.configPath}`);

  return lines.join('\n');
}
