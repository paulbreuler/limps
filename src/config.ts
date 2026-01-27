import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
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
    weights: ScoringWeights;
    biases: ScoringBiases;
  };
  extensions?: string[]; // Extension package names to load (e.g., ["@sudosandwich/limps-radix"])
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
  return config.scoring.weights;
}

/**
 * Default scoring biases (initial config values).
 */
export const DEFAULT_SCORING_BIASES: ScoringBiases = {};

/**
 * Get scoring biases from config.
 *
 * @param config - Server configuration
 * @returns Scoring biases
 */
export function getScoringBiases(config: ServerConfig): ScoringBiases {
  return config.scoring.biases;
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
 * Load configuration from file.
 * Creates default configuration file if it doesn't exist.
 * Paths are resolved relative to the config file location.
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
    extensions: typedConfig.extensions,
  };

  // Preserve extension-specific config keys at top level.
  const mergedConfig: ServerConfig = {
    ...(config as Record<string, unknown>),
    ...resolvedConfig,
  } as ServerConfig;

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

  if (!c.scoring || typeof c.scoring !== 'object') {
    return false;
  }

  const scoring = c.scoring as Partial<ServerConfig['scoring']>;
  if (!scoring.weights || !scoring.biases) {
    return false;
  }
  if (
    typeof scoring.weights.dependency !== 'number' ||
    typeof scoring.weights.priority !== 'number' ||
    typeof scoring.weights.workload !== 'number'
  ) {
    return false;
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
