import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { homedir } from 'os';

/**
 * Scoring weights for task prioritization.
 */
export interface ScoringWeights {
  dependency: number; // default: 40
  priority: number; // default: 30
  workload: number; // default: 30
}

/**
 * Server configuration interface.
 */
export interface ServerConfig {
  plansPath: string;
  docsPaths?: string[]; // Additional paths to index
  fileExtensions?: string[]; // File types to index (default: ['.md'])
  dataPath: string;
  scoring?: {
    weights?: Partial<ScoringWeights>;
  };
}

/**
 * Default file extensions to index.
 */
const DEFAULT_FILE_EXTENSIONS = ['.md'];

/**
 * Default scoring weights for task prioritization.
 */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  dependency: 40,
  priority: 30,
  workload: 30,
};

/**
 * Get scoring weights from config, merging with defaults.
 *
 * @param config - Server configuration
 * @returns Complete scoring weights with defaults applied
 */
export function getScoringWeights(config: ServerConfig): ScoringWeights {
  return {
    ...DEFAULT_SCORING_WEIGHTS,
    ...config.scoring?.weights,
  };
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
  plansPath: './plans',
  docsPaths: undefined,
  fileExtensions: undefined,
  dataPath: './data',
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
  const config = JSON.parse(content) as Partial<ServerConfig>;

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
  const resolvedDocsPaths = config.docsPaths ? config.docsPaths.map(resolvePath) : undefined;

  // Merge with defaults and resolve paths (with tilde expansion)
  const mergedConfig: ServerConfig = {
    plansPath: resolvePath(config.plansPath || DEFAULT_CONFIG.plansPath),
    docsPaths: resolvedDocsPaths,
    fileExtensions: config.fileExtensions,
    dataPath: resolvePath(config.dataPath || DEFAULT_CONFIG.dataPath),
  };

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
