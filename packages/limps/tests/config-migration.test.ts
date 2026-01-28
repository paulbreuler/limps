import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadConfig,
  CURRENT_CONFIG_VERSION,
  DEFAULT_SCORING_WEIGHTS,
  DEFAULT_SCORING_BIASES,
} from '../src/config.js';

describe('config-migration', () => {
  let configPath: string;
  let configDir: string;

  beforeEach(() => {
    configDir = join(tmpdir(), `config-migration-test-${Date.now()}`);
    configPath = join(configDir, 'config.json');
    mkdirSync(configDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(configPath)) {
      unlinkSync(configPath);
    }
    if (existsSync(configDir)) {
      try {
        rmSync(configDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    }
  });

  it('should migrate config without scoring field by adding defaults', () => {
    // Create a pre-v1 config without scoring
    const oldConfig = {
      plansPath: './plans',
      dataPath: './data',
    };
    writeFileSync(configPath, JSON.stringify(oldConfig, null, 2), 'utf-8');

    // Load should succeed after migration
    const config = loadConfig(configPath);

    // Verify scoring was added with defaults
    expect(config.scoring).toBeDefined();
    expect(config.scoring.weights).toEqual(DEFAULT_SCORING_WEIGHTS);
    expect(config.scoring.biases).toEqual(DEFAULT_SCORING_BIASES);
  });

  it('should write migrated config back to disk', () => {
    // Create a pre-v1 config without scoring
    const oldConfig = {
      plansPath: './plans',
      dataPath: './data',
    };
    writeFileSync(configPath, JSON.stringify(oldConfig, null, 2), 'utf-8');

    // Load triggers migration
    loadConfig(configPath);

    // Read the file directly to verify it was saved
    const savedContent = readFileSync(configPath, 'utf-8');
    const savedConfig = JSON.parse(savedContent);

    expect(savedConfig.scoring).toBeDefined();
    expect(savedConfig.scoring.weights).toEqual(DEFAULT_SCORING_WEIGHTS);
    expect(savedConfig.scoring.biases).toEqual(DEFAULT_SCORING_BIASES);
  });

  it('should migrate config with partial scoring (missing weights)', () => {
    const oldConfig = {
      plansPath: './plans',
      dataPath: './data',
      scoring: {
        biases: { plans: { 'test-plan': 10 } },
      },
    };
    writeFileSync(configPath, JSON.stringify(oldConfig, null, 2), 'utf-8');

    const config = loadConfig(configPath);

    // Scoring should be replaced with full defaults (not merged)
    expect(config.scoring.weights).toEqual(DEFAULT_SCORING_WEIGHTS);
    expect(config.scoring.biases).toEqual(DEFAULT_SCORING_BIASES);
  });

  it('should migrate config with partial scoring (missing biases)', () => {
    const oldConfig = {
      plansPath: './plans',
      dataPath: './data',
      scoring: {
        weights: { dependency: 50, priority: 25, workload: 25 },
      },
    };
    writeFileSync(configPath, JSON.stringify(oldConfig, null, 2), 'utf-8');

    const config = loadConfig(configPath);

    // Scoring should be replaced with defaults when biases is missing
    expect(config.scoring.weights).toEqual(DEFAULT_SCORING_WEIGHTS);
    expect(config.scoring.biases).toEqual(DEFAULT_SCORING_BIASES);
  });

  it('should add configVersion during migration', () => {
    const oldConfig = {
      plansPath: './plans',
      dataPath: './data',
    };
    writeFileSync(configPath, JSON.stringify(oldConfig, null, 2), 'utf-8');

    const config = loadConfig(configPath);

    expect(config.configVersion).toBe(CURRENT_CONFIG_VERSION);

    // Verify it was saved to disk
    const savedContent = readFileSync(configPath, 'utf-8');
    const savedConfig = JSON.parse(savedContent);
    expect(savedConfig.configVersion).toBe(CURRENT_CONFIG_VERSION);
  });

  it('should not modify config that already has scoring and version', () => {
    const existingConfig = {
      configVersion: CURRENT_CONFIG_VERSION,
      plansPath: './plans',
      dataPath: './data',
      scoring: {
        weights: { dependency: 50, priority: 25, workload: 25 },
        biases: { plans: { 'custom-plan': 20 } },
      },
    };
    writeFileSync(configPath, JSON.stringify(existingConfig, null, 2), 'utf-8');

    const config = loadConfig(configPath);

    // Custom values should be preserved
    expect(config.scoring.weights).toEqual({ dependency: 50, priority: 25, workload: 25 });
    expect(config.scoring.biases).toEqual({ plans: { 'custom-plan': 20 } });
    expect(config.configVersion).toBe(CURRENT_CONFIG_VERSION);
  });

  it('should add configVersion to config that has scoring but no version', () => {
    const oldConfig = {
      plansPath: './plans',
      dataPath: './data',
      scoring: {
        weights: { dependency: 40, priority: 30, workload: 30 },
        biases: {},
      },
    };
    writeFileSync(configPath, JSON.stringify(oldConfig, null, 2), 'utf-8');

    const config = loadConfig(configPath);

    expect(config.configVersion).toBe(CURRENT_CONFIG_VERSION);

    // Verify it was saved to disk
    const savedContent = readFileSync(configPath, 'utf-8');
    const savedConfig = JSON.parse(savedContent);
    expect(savedConfig.configVersion).toBe(CURRENT_CONFIG_VERSION);
  });
});
