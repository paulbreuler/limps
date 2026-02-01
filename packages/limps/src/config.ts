import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { homedir } from 'os';

/**
 * Scoring weights for task prioritization.
 */
export interface ScoringWeights {
  dependency: number;
  priority: number;
  workload: number;
}

/**
 * Scoring biases for task prioritization.
 * Biases add/subtract from the weighted score (-50 to +50 range recommended).
 */
export interface ScoringBiases {
  plans?: Record<string, number>;
  personas?: {
    coder?: number;
    reviewer?: number;
    pm?: number;
    customer?: number;
  };
  statuses?: {
    GAP?: number;
    WIP?: number;
    BLOCKED?: number;
  };
}

export type ScoringPreset =
  | 'default'
  | 'quick-wins'
  | 'dependency-chain'
  | 'newest-first'
  | 'code-then-review';

/**
 * Tool filtering configuration.
 * Allowlist takes precedence over denylist when both are provided.
 */
export interface ToolFilteringConfig {
  allowlist?: string[]; // Explicit tools to expose
  denylist?: string[]; // Tools to hide
}

/**
 * Server configuration interface.
 */
export interface ServerConfig {
  configVersion?: number; // Config schema version for migrations
  plansPath: string;
  docsPaths?: string[]; // Additional paths to index
  fileExtensions?: string[]; // File types to index (default: ['.md'])
  dataPath: string;
  scoring: {
    preset?: ScoringPreset;
    weights: Partial<ScoringWeights>;
    biases: Partial<ScoringBiases>;
  };
  tools?: ToolFilteringConfig;
  extensions?: string[]; // Extension package names to load (e.g., ["@sudosandwich/limps-headless"])
}

/**
 * Current config schema version.
 * Increment when making breaking changes that require migration.
 */
export const CURRENT_CONFIG_VERSION = 1;

/**
 * Default file extensions to index.
 */
const DEFAULT_FILE_EXTENSIONS = ['.md'];

/**
 * Default scoring weights for task prioritization (initial config values).
 */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  dependency: 40,
  priority: 30,
  workload: 30,
};

/**
 * Get scoring weights from config.
 *
 * @param config - Server configuration
 * @returns Scoring weights
 */
export function getScoringWeights(config: ServerConfig): ScoringWeights {
  const presetKey = config.scoring.preset ?? 'default';
  const preset = SCORING_PRESETS[presetKey] ?? SCORING_PRESETS.default;
  return {
    ...DEFAULT_SCORING_WEIGHTS,
    ...preset.weights,
    ...(config.scoring.weights ?? {}),
  };
}

/**
 * Default scoring biases (initial config values).
 */
export const DEFAULT_SCORING_BIASES: ScoringBiases = {};

export const SCORING_PRESETS: Record<
  ScoringPreset,
  { weights: ScoringWeights; biases: ScoringBiases }
> = {
  default: {
    weights: DEFAULT_SCORING_WEIGHTS,
    biases: {},
  },
  'quick-wins': {
    weights: { dependency: 20, priority: 20, workload: 60 },
    biases: {},
  },
  'dependency-chain': {
    weights: { dependency: 60, priority: 20, workload: 20 },
    biases: { statuses: { BLOCKED: 20 } },
  },
  'newest-first': {
    weights: { dependency: 30, priority: 40, workload: 30 },
    biases: {},
  },
  'code-then-review': {
    weights: DEFAULT_SCORING_WEIGHTS,
    biases: { personas: { coder: 10, reviewer: -10 } },
  },
};

/**
 * Get scoring biases from config.
 *
 * @param config - Server configuration
 * @returns Scoring biases
 */
export function getScoringBiases(config: ServerConfig): ScoringBiases {
  const biases = config.scoring.biases;
  const presetKey = config.scoring.preset ?? 'default';
  const preset = SCORING_PRESETS[presetKey] ?? SCORING_PRESETS.default;
  const mergedPlans = {
    ...(DEFAULT_SCORING_BIASES.plans ?? {}),
    ...(preset.biases.plans ?? {}),
    ...(biases.plans ?? {}),
  };
  const mergedPersonas = {
    ...(DEFAULT_SCORING_BIASES.personas ?? {}),
    ...(preset.biases.personas ?? {}),
    ...(biases.personas ?? {}),
  };
  const mergedStatuses = {
    ...(DEFAULT_SCORING_BIASES.statuses ?? {}),
    ...(preset.biases.statuses ?? {}),
    ...(biases.statuses ?? {}),
  };

  const merged: ScoringBiases = {};
  if (Object.keys(mergedPlans).length > 0) {
    merged.plans = mergedPlans;
  }
  if (Object.keys(mergedPersonas).length > 0) {
    merged.personas = mergedPersonas;
  }
  if (Object.keys(mergedStatuses).length > 0) {
    merged.statuses = mergedStatuses;
  }

  return merged;
}

/**
 * Default debounce delay for file watching (ms).
 * Hardcoded - not user-configurable.
 */
export const DEFAULT_DEBOUNCE_DELAY = 200;

/**
 * Default server configuration.
 */
const DEFAULT_CONFIG: ServerConfig = {
  configVersion: CURRENT_CONFIG_VERSION,
  plansPath: './plans',
  docsPaths: undefined,
  fileExtensions: undefined,
  dataPath: './data',
  scoring: {
    weights: DEFAULT_SCORING_WEIGHTS,
    biases: DEFAULT_SCORING_BIASES,
  },
  tools: undefined,
  extensions: undefined,
};

/**
 * Expand tilde (~) to home directory in a path.
 *
 * @param path - Path that may contain ~ prefix
 * @returns Path with ~ expanded to home directory
 */
export function expandTilde(path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return path.replace(/^~/, homedir());
  }
  return path;
}

/**
/**
 * Remove deprecated coordination.json if present (coordination system was removed in v2).
 */
function removeDeprecatedCoordinationFile(filePath: string): void {
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch {
      // ignore
    }
  }
}

/**
 * Load configuration from file.
 * Creates default configuration file if it doesn't exist.
 * Paths are resolved relative to the config file location.
 * Removes deprecated coordination.json if found in config or data dir.
 *
 * @param configPath - Path to config.json file
 * @returns Server configuration
 */
export function loadConfig(configPath: string): ServerConfig {
  const configDir = dirname(configPath);

  if (!existsSync(configPath)) {
    // Create default config file
    const defaultConfig = { ...DEFAULT_CONFIG };
    // Resolve paths relative to config file
    defaultConfig.plansPath = resolve(configDir, DEFAULT_CONFIG.plansPath);
    defaultConfig.dataPath = resolve(configDir, DEFAULT_CONFIG.dataPath);

    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    removeDeprecatedCoordinationFile(join(configDir, 'coordination.json'));
    removeDeprecatedCoordinationFile(join(defaultConfig.dataPath, 'coordination.json'));
    return defaultConfig;
  }

  const content = readFileSync(configPath, 'utf-8');
  const config = JSON.parse(content) as Record<string, unknown>;
  const typedConfig = config as Partial<ServerConfig>;

  // Migration: add scoring if missing (pre-v1 configs)
  let needsSave = false;
  let scoring = typedConfig.scoring;
  if (!scoring?.weights || !scoring?.biases) {
    scoring = {
      weights: DEFAULT_SCORING_WEIGHTS,
      biases: DEFAULT_SCORING_BIASES,
    };
    typedConfig.scoring = scoring;
    needsSave = true;
  }

  // Migration: add configVersion if missing
  if (typedConfig.configVersion === undefined) {
    typedConfig.configVersion = CURRENT_CONFIG_VERSION;
    needsSave = true;
  }

  // Migration: remove deprecated coordination-related keys (coordination system was removed in v2)
  if ('coordinationPath' in config) {
    delete (config as Record<string, unknown>).coordinationPath;
    needsSave = true;
  }
  if ('heartbeatTimeout' in config) {
    delete (config as Record<string, unknown>).heartbeatTimeout;
    needsSave = true;
  }
  if ('debounceDelay' in config) {
    delete (config as Record<string, unknown>).debounceDelay;
    needsSave = true;
  }
  if ('maxHandoffIterations' in config) {
    delete (config as Record<string, unknown>).maxHandoffIterations;
    needsSave = true;
  }

  // Save migrated config back to disk
  if (needsSave) {
    writeFileSync(configPath, JSON.stringify(typedConfig, null, 2), 'utf-8');
  }

  // Helper to resolve path with tilde expansion
  const resolvePath = (p: string): string => {
    const expanded = expandTilde(p);
    // If path starts with ~ it's now absolute, otherwise resolve relative to configDir
    if (p.startsWith('~')) {
      return expanded;
    }
    return resolve(configDir, expanded);
  };

  // Resolve docsPaths relative to config file (with tilde expansion)
  const resolvedDocsPaths = typedConfig.docsPaths
    ? typedConfig.docsPaths.map(resolvePath)
    : undefined;

  // Merge with defaults and resolve paths (with tilde expansion)
  const resolvedConfig: ServerConfig = {
    configVersion: typedConfig.configVersion,
    plansPath: resolvePath(typedConfig.plansPath || DEFAULT_CONFIG.plansPath),
    docsPaths: resolvedDocsPaths,
    fileExtensions: typedConfig.fileExtensions,
    dataPath: resolvePath(typedConfig.dataPath || DEFAULT_CONFIG.dataPath),
    scoring,
    tools: typedConfig.tools,
    extensions: typedConfig.extensions,
  };

  // Preserve extension-specific config keys at top level.
  const mergedConfig: ServerConfig = {
    ...(config as Record<string, unknown>),
    ...resolvedConfig,
  } as ServerConfig;

  // Remove deprecated coordination.json if present (coordination system was removed in v2)
  removeDeprecatedCoordinationFile(join(configDir, 'coordination.json'));
  removeDeprecatedCoordinationFile(join(resolvedConfig.dataPath, 'coordination.json'));

  return mergedConfig;
}

/**
 * Validate configuration object.
 * Uses type checking to ensure all required fields are present and correct types.
 *
 * @param config - Configuration object to validate
 * @returns true if valid, false otherwise
 */
export function validateConfig(config: unknown): config is ServerConfig {
  if (!config || typeof config !== 'object') {
    return false;
  }

  const c = config as Partial<ServerConfig>;

  // Check required fields
  if (typeof c.plansPath !== 'string' || typeof c.dataPath !== 'string') {
    return false;
  }

  // Check optional docsPaths (must be string array if present)
  if (c.docsPaths !== undefined) {
    if (!Array.isArray(c.docsPaths) || !c.docsPaths.every((p) => typeof p === 'string')) {
      return false;
    }
  }

  // Check optional fileExtensions (must be string array if present)
  if (c.fileExtensions !== undefined) {
    if (!Array.isArray(c.fileExtensions) || !c.fileExtensions.every((e) => typeof e === 'string')) {
      return false;
    }
  }

  if (c.tools !== undefined) {
    if (typeof c.tools !== 'object' || c.tools === null) {
      return false;
    }
    const tools = c.tools as ToolFilteringConfig;
    if (tools.allowlist !== undefined) {
      if (!Array.isArray(tools.allowlist) || !tools.allowlist.every((t) => typeof t === 'string')) {
        return false;
      }
    }
    if (tools.denylist !== undefined) {
      if (!Array.isArray(tools.denylist) || !tools.denylist.every((t) => typeof t === 'string')) {
        return false;
      }
    }
  }

  if (!c.scoring || typeof c.scoring !== 'object') {
    return false;
  }

  const scoring = c.scoring as Partial<ServerConfig['scoring']>;
  if (!scoring.weights || !scoring.biases) {
    return false;
  }
  if (scoring.preset !== undefined) {
    const presets = new Set<ScoringPreset>([
      'default',
      'quick-wins',
      'dependency-chain',
      'newest-first',
      'code-then-review',
    ]);
    if (!presets.has(scoring.preset)) {
      return false;
    }
  }
  if (scoring.weights.dependency !== undefined && typeof scoring.weights.dependency !== 'number') {
    return false;
  }
  if (scoring.weights.priority !== undefined && typeof scoring.weights.priority !== 'number') {
    return false;
  }
  if (scoring.weights.workload !== undefined && typeof scoring.weights.workload !== 'number') {
    return false;
  }
  if (scoring.biases.plans !== undefined) {
    if (typeof scoring.biases.plans !== 'object' || scoring.biases.plans === null) {
      return false;
    }
    if (!Object.values(scoring.biases.plans).every((value) => typeof value === 'number')) {
      return false;
    }
  }
  if (scoring.biases.personas !== undefined) {
    if (typeof scoring.biases.personas !== 'object' || scoring.biases.personas === null) {
      return false;
    }
    const personas = scoring.biases.personas;
    if (personas.coder !== undefined && typeof personas.coder !== 'number') {
      return false;
    }
    if (personas.reviewer !== undefined && typeof personas.reviewer !== 'number') {
      return false;
    }
    if (personas.pm !== undefined && typeof personas.pm !== 'number') {
      return false;
    }
    if (personas.customer !== undefined && typeof personas.customer !== 'number') {
      return false;
    }
  }
  if (scoring.biases.statuses !== undefined) {
    if (typeof scoring.biases.statuses !== 'object' || scoring.biases.statuses === null) {
      return false;
    }
    const statuses = scoring.biases.statuses;
    if (statuses.GAP !== undefined && typeof statuses.GAP !== 'number') {
      return false;
    }
    if (statuses.WIP !== undefined && typeof statuses.WIP !== 'number') {
      return false;
    }
    if (statuses.BLOCKED !== undefined && typeof statuses.BLOCKED !== 'number') {
      return false;
    }
  }

  return true;
}

/**
 * Get all documentation paths to index.
 * Combines plansPath with any additional docsPaths, deduplicating.
 *
 * @param config - Server configuration
 * @returns Array of unique paths to index
 */
export function getAllDocsPaths(config: ServerConfig): string[] {
  const paths = new Set<string>();
  paths.add(config.plansPath);
  if (config.docsPaths) {
    for (const p of config.docsPaths) {
      paths.add(p);
    }
  }
  return Array.from(paths);
}

/**
 * Get file extensions to index.
 * Returns configured extensions or default ['.md'].
 *
 * @param config - Server configuration
 * @returns Array of file extensions (e.g., ['.md', '.jsx', '.tsx'])
 */
export function getFileExtensions(config: ServerConfig): string[] {
  return config.fileExtensions || DEFAULT_FILE_EXTENSIONS;
}
