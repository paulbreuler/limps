/**
 * Shared test helper for creating config files in test directories.
 * Since loadConfig() no longer auto-creates config files, tests must
 * create a config.json before calling loadConfig().
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { loadConfig, type ServerConfig } from '../src/config.js';

/**
 * Create a minimal config.json in the given directory and load it.
 *
 * @param testDir - Directory where config.json will be created
 * @returns Loaded ServerConfig (paths resolved relative to testDir)
 */
export function createTestConfig(testDir: string): ServerConfig {
  const configPath = join(testDir, 'config.json');
  const minimalConfig = {
    configVersion: 1,
    plansPath: './plans',
    dataPath: './data',
    scoring: {
      weights: { dependency: 40, priority: 30, workload: 30 },
      biases: {},
    },
  };
  writeFileSync(configPath, JSON.stringify(minimalConfig, null, 2), 'utf-8');
  return loadConfig(configPath);
}
