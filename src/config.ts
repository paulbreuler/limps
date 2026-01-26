import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { homedir } from 'os';
import { checkDeprecations, emitDeprecationWarnings } from './utils/deprecations.js';

/**
 * Server configuration interface.
 */
export interface ServerConfig {
  plansPath: string;
  docsPaths?: string[]; // Additional paths to index
  fileExtensions?: string[]; // File types to index (default: ['.md'])
  dataPath: string;
  coordinationPath: string;
  heartbeatTimeout: number; // milliseconds
  debounceDelay: number; // milliseconds
  maxHandoffIterations: number;
}

/**
 * Default file extensions to index.
 */
const DEFAULT_FILE_EXTENSIONS = ['.md'];

/**
 * Default server configuration.
 */
const DEFAULT_CONFIG: ServerConfig = {
  plansPath: './plans',
  docsPaths: undefined,
  fileExtensions: undefined,
  dataPath: './data',
  coordinationPath: './coordination.json',
  heartbeatTimeout: 300000, // 5 minutes
  debounceDelay: 200, // 200ms
  maxHandoffIterations: 3,
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
    defaultConfig.coordinationPath = resolve(configDir, DEFAULT_CONFIG.coordinationPath);

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
    coordinationPath: resolvePath(config.coordinationPath || DEFAULT_CONFIG.coordinationPath),
    heartbeatTimeout: config.heartbeatTimeout ?? DEFAULT_CONFIG.heartbeatTimeout,
    debounceDelay: config.debounceDelay ?? DEFAULT_CONFIG.debounceDelay,
    maxHandoffIterations: config.maxHandoffIterations ?? DEFAULT_CONFIG.maxHandoffIterations,
  };

  // Check for deprecated options and emit warnings to stderr
  const deprecatedOptions = checkDeprecations(config);
  emitDeprecationWarnings(deprecatedOptions);

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
  if (
    typeof c.plansPath !== 'string' ||
    typeof c.dataPath !== 'string' ||
    typeof c.coordinationPath !== 'string' ||
    typeof c.heartbeatTimeout !== 'number' ||
    typeof c.debounceDelay !== 'number' ||
    typeof c.maxHandoffIterations !== 'number'
  ) {
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

  // Check positive values
  if (c.heartbeatTimeout < 0 || c.debounceDelay < 0 || c.maxHandoffIterations < 0) {
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
