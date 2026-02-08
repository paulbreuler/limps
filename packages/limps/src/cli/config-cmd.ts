/**
 * Config subcommand handlers for limps CLI.
 * Provides commands to view and update project configuration.
 */

import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { dirname, basename } from 'path';
import * as toml from '@iarna/toml';
import {
  loadConfig,
  getScoringWeights,
  getScoringBiases,
  SCORING_PRESETS,
  getHttpServerConfig,
  type ScoringPreset,
  type ScoringWeights,
  type ScoringBiases,
  type ServerConfig,
} from '../config.js';
import { getPidFilePath, getRunningDaemon, removePidFile } from '../pidfile.js';

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
    return `Config file not found: ${configPath}\n\nRun \`limps init\` to create a project.`;
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
    if (config.scoring.preset) {
      lines.push(`    preset:`);
      lines.push(`      ${config.scoring.preset}`);
    }

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
 * Upgrade config schema to the latest version.
 *
 * @param resolveConfigPathFn - Function to resolve config path
 * @returns Formatted upgrade summary
 */
export function configUpgrade(resolveConfigPathFn: () => string): string {
  const configPath = resolveConfigPathFn();
  const config = loadConfig(configPath);
  return `Config upgraded to version ${config.configVersion ?? 'unknown'}.\nPath: ${configPath}`;
}

export interface ScoringConfigUpdateOptions {
  preset?: ScoringPreset;
  weights?: Partial<ScoringWeights>;
  biases?: Partial<ScoringBiases>;
}

export function configScoringShow(resolveConfigPathFn: () => string): string {
  const configPath = resolveConfigPathFn();

  if (!existsSync(configPath)) {
    return `Config file not found: ${configPath}\n\nRun \`limps init\` to create a project.`;
  }

  const config = loadConfig(configPath);
  const weights = getScoringWeights(config);
  const biases = getScoringBiases(config);

  const lines: string[] = [];
  lines.push(`Config file: ${configPath}`);
  lines.push('');
  lines.push('Scoring:');
  lines.push(`  preset: ${config.scoring.preset ?? 'default'}`);
  lines.push('  weights:');
  lines.push(`    dependency: ${weights.dependency}`);
  lines.push(`    priority:   ${weights.priority}`);
  lines.push(`    workload:   ${weights.workload}`);

  const hasPlanBiases = biases.plans && Object.keys(biases.plans).length > 0;
  const hasPersonaBiases = biases.personas && Object.values(biases.personas).length > 0;
  const hasStatusBiases = biases.statuses && Object.values(biases.statuses).length > 0;
  if (hasPlanBiases || hasPersonaBiases || hasStatusBiases) {
    lines.push('  biases:');
    if (hasPlanBiases && biases.plans) {
      lines.push('    plans:');
      for (const [plan, value] of Object.entries(biases.plans)) {
        lines.push(`      ${plan}: ${value > 0 ? '+' : ''}${value}`);
      }
    }
    if (hasPersonaBiases && biases.personas) {
      lines.push('    personas:');
      for (const [persona, value] of Object.entries(biases.personas)) {
        lines.push(`      ${persona}: ${value > 0 ? '+' : ''}${value}`);
      }
    }
    if (hasStatusBiases && biases.statuses) {
      lines.push('    statuses:');
      for (const [status, value] of Object.entries(biases.statuses)) {
        lines.push(`      ${status}: ${value > 0 ? '+' : ''}${value}`);
      }
    }
  }

  return lines.join('\n');
}

export function configScoringUpdate(
  resolveConfigPathFn: () => string,
  options: ScoringConfigUpdateOptions
): string {
  const configPath = resolveConfigPathFn();

  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const content = readFileSync(configPath, 'utf-8');
  const config = JSON.parse(content) as Record<string, unknown>;
  const typedConfig = config as Partial<ServerConfig>;

  if (!typedConfig.scoring || typeof typedConfig.scoring !== 'object') {
    typedConfig.scoring = { weights: {}, biases: {} };
  }
  if (!typedConfig.scoring.weights || typeof typedConfig.scoring.weights !== 'object') {
    typedConfig.scoring.weights = {};
  }
  if (!typedConfig.scoring.biases || typeof typedConfig.scoring.biases !== 'object') {
    typedConfig.scoring.biases = {};
  }

  const changes: string[] = [];

  if (options.preset) {
    if (!SCORING_PRESETS[options.preset]) {
      throw new Error(
        `Unknown preset: ${options.preset}. Valid presets: ${Object.keys(SCORING_PRESETS).join(', ')}`
      );
    }
    typedConfig.scoring.preset = options.preset;
    changes.push(`  preset: ${options.preset}`);
    if (!options.weights) {
      typedConfig.scoring.weights = {};
    }
    if (!options.biases) {
      typedConfig.scoring.biases = {};
    }
  }

  if (options.weights && Object.keys(options.weights).length > 0) {
    typedConfig.scoring.weights = {
      ...typedConfig.scoring.weights,
      ...options.weights,
    };
    for (const [key, value] of Object.entries(options.weights)) {
      changes.push(`  weight.${key}: ${value}`);
    }
  }

  if (options.biases && Object.keys(options.biases).length > 0) {
    const existingBiases = typedConfig.scoring.biases;
    typedConfig.scoring.biases = {
      ...existingBiases,
      ...options.biases,
      plans: {
        ...(existingBiases?.plans ?? {}),
        ...(options.biases.plans ?? {}),
      },
      personas: {
        ...(existingBiases?.personas ?? {}),
        ...(options.biases.personas ?? {}),
      },
      statuses: {
        ...(existingBiases?.statuses ?? {}),
        ...(options.biases.statuses ?? {}),
      },
    };
    if (options.biases.plans) {
      for (const [plan, value] of Object.entries(options.biases.plans)) {
        changes.push(`  bias.plan:${plan}=${value}`);
      }
    }
    if (options.biases.personas) {
      for (const [persona, value] of Object.entries(options.biases.personas)) {
        changes.push(`  bias.persona:${persona}=${value}`);
      }
    }
    if (options.biases.statuses) {
      for (const [status, value] of Object.entries(options.biases.statuses)) {
        changes.push(`  bias.status:${status}=${value}`);
      }
    }
  }

  if (changes.length === 0) {
    return 'No scoring changes specified. Use --preset, --weight, or --bias to update scoring.';
  }

  writeFileSync(configPath, JSON.stringify(typedConfig, null, 2));

  const lines: string[] = [];
  lines.push('Updated scoring configuration:');
  lines.push('');
  lines.push(...changes);
  lines.push('');
  lines.push(`Config file: ${configPath}`);
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
 * Reset limps state for a single project: stop daemon, delete dataPath contents.
 *
 * @param configPath - Path to the project's config.json
 * @param options - Reset options (force must be true to proceed)
 * @returns Log of actions taken
 */
export function resetAll(configPath: string, options: { force?: boolean } = {}): string[] {
  const log: string[] = [];

  if (!existsSync(configPath)) {
    log.push(`Config file not found: ${configPath}`);
    return log;
  }

  let config: ServerConfig;
  try {
    config = loadConfig(configPath);
  } catch {
    log.push(`Failed to load config: ${configPath}`);
    return log;
  }

  if (!options.force) {
    // Dry-run: describe what would be deleted
    log.push('The following will be deleted:');
    log.push('');
    log.push(`  Data dir: ${config.dataPath}`);
    log.push('');
    log.push('Run with --force to confirm.');
    return log;
  }

  const dataPath = config.dataPath;

  // Stop running daemon
  try {
    const pidFilePath = getPidFilePath(dataPath);
    const daemon = getRunningDaemon(pidFilePath);
    if (daemon) {
      try {
        process.kill(daemon.pid, 'SIGTERM');
        log.push(`Stopped daemon (PID ${daemon.pid})`);
      } catch {
        log.push(`Daemon (PID ${daemon.pid}) already stopped`);
      }
      removePidFile(pidFilePath);
    }
  } catch {
    // Best effort
  }

  // Delete dataPath directory
  if (existsSync(dataPath)) {
    rmSync(dataPath, { recursive: true, force: true });
    log.push(`Deleted data dir: ${dataPath}`);
  }

  if (log.length === 0) {
    log.push('Nothing to reset — no limps state found.');
  }

  return log;
}

import { type McpClientAdapter, type McpServerConfig } from './mcp-client-adapter.js';

/**
 * Generate MCP server configuration JSON for a single limps project.
 * Always generates HTTP transport configuration (limps v3 daemon mode).
 *
 * @param adapter - MCP client adapter
 * @param configPath - Path to the limps config file
 * @returns Object with servers key and the servers configuration
 * @throws Error if config not found
 */
export function generateMcpClientConfig(
  adapter: McpClientAdapter,
  configPath: string
): {
  serversKey: string;
  servers: Record<string, McpServerConfig>;
  fullConfig: Record<string, unknown>;
} {
  if (!existsSync(configPath)) {
    throw new Error(
      `Limps config not found: ${configPath}\nRun \`limps init\` to create a project first.`
    );
  }

  // Derive server name from project directory (skip .limps if present)
  const parentDir = basename(dirname(configPath));
  const projectDir = parentDir === '.limps' ? basename(dirname(dirname(configPath))) : parentDir;
  const serverName = `limps-planning-${projectDir}`;

  // Load HTTP server config
  const config = loadConfig(configPath);
  const httpConfig = getHttpServerConfig(config);

  // Build servers configuration (HTTP transport only)
  const servers: Record<string, McpServerConfig> = {
    [serverName]: adapter.createHttpServerConfig(httpConfig.host, httpConfig.port),
  };

  // Build full config structure
  const serversKey = adapter.getServersKey();
  const fullConfig: Record<string, unknown> = {};

  if (adapter.useFlatKey?.()) {
    fullConfig[serversKey] = servers;
  } else {
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
 * Generate config for printing.
 * Always generates HTTP transport configuration (limps v3 daemon mode).
 */
export function generateConfigForPrint(adapter: McpClientAdapter, configPath: string): string {
  const { fullConfig, serversKey } = generateMcpClientConfig(adapter, configPath);

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
 * Generate ChatGPT MCP connector setup instructions.
 */
export function generateChatGptInstructions(configPath: string): string {
  if (!existsSync(configPath)) {
    throw new Error(
      `Limps config not found: ${configPath}\nRun \`limps init\` to create a project first.`
    );
  }

  const parentDir = basename(dirname(configPath));
  const projectDir = parentDir === '.limps' ? basename(dirname(dirname(configPath))) : parentDir;
  const serverName = `limps-planning-${projectDir}`;

  const lines: string[] = [];
  lines.push('ChatGPT Custom Connector Setup (Manual)');
  lines.push('');
  lines.push(
    'ChatGPT requires a remote MCP server reachable over HTTPS. limps runs over stdio, so deploy it behind an MCP-compatible HTTP/SSE transport or proxy.'
  );
  lines.push('');
  lines.push('Create a Custom Connector in ChatGPT with:');
  lines.push('');
  lines.push(`  Server Name: ${serverName}`);
  lines.push('  Server URL: https://your-domain.example/mcp');
  lines.push('  Authentication: (required by your deployment)');
  lines.push(`  limps command: limps serve --config ${configPath}`);
  lines.push('');
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
 *
 * @param configPath - Path to the config file to update
 * @param options - Fields to update
 * @returns Success message
 * @throws Error if config file doesn't exist
 */
export function configUpdate(configPath: string, options: ConfigUpdateOptions): string {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const content = readFileSync(configPath, 'utf-8');
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

  writeFileSync(configPath, JSON.stringify(config, null, 2));

  const lines: string[] = [];
  lines.push(`Updated configuration:`);
  lines.push('');
  lines.push(...changes);
  lines.push('');
  lines.push(`Config file: ${configPath}`);

  return lines.join('\n');
}
