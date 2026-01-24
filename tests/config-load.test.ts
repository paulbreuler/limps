import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig, type ServerConfig } from '../src/config.js';

describe('config-load', () => {
  let configPath: string;
  let configDir: string;

  beforeEach(() => {
    configDir = join(tmpdir(), `config-test-${Date.now()}`);
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

  it('should load configuration from file', () => {
    const configData: ServerConfig = {
      plansPath: join(configDir, 'plans'),
      dataPath: join(configDir, 'data'),
      coordinationPath: join(configDir, 'coordination.json'),
      heartbeatTimeout: 300000,
      debounceDelay: 200,
      maxHandoffIterations: 3,
    };
    writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');

    const config = loadConfig(configPath);
    expect(config.plansPath).toBe(configData.plansPath);
    expect(config.dataPath).toBe(configData.dataPath);
    expect(config.coordinationPath).toBe(configData.coordinationPath);
    expect(config.heartbeatTimeout).toBe(300000);
    expect(config.debounceDelay).toBe(200);
    expect(config.maxHandoffIterations).toBe(3);
  });

  it('should use default configuration when file does not exist', () => {
    const config = loadConfig(configPath);
    expect(config.plansPath).toBeDefined();
    expect(config.dataPath).toBeDefined();
    expect(config.coordinationPath).toBeDefined();
    expect(config.heartbeatTimeout).toBeGreaterThan(0);
    expect(config.debounceDelay).toBeGreaterThan(0);
    expect(config.maxHandoffIterations).toBeGreaterThan(0);
    // File should be created with defaults
    expect(existsSync(configPath)).toBe(true);
  });

  it('should resolve paths relative to config file location', () => {
    const configData: ServerConfig = {
      plansPath: './plans',
      dataPath: './data',
      coordinationPath: './coordination.json',
      heartbeatTimeout: 300000,
      debounceDelay: 200,
      maxHandoffIterations: 3,
    };
    writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');

    const config = loadConfig(configPath);
    // Paths should be resolved relative to config file
    expect(config.plansPath).toContain(configDir);
    expect(config.dataPath).toContain(configDir);
    expect(config.coordinationPath).toContain(configDir);
  });
});
