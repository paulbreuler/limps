import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { loadConfig, expandTilde, type ServerConfig } from '../src/config.js';

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
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
    };
    writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');

    const config = loadConfig(configPath);
    expect(config.plansPath).toBe(configData.plansPath);
    expect(config.dataPath).toBe(configData.dataPath);
  });

  it('should preserve extension-specific config keys', () => {
    const configData = {
      plansPath: join(configDir, 'plans'),
      dataPath: join(configDir, 'data'),
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
      extensions: ['@sudosandwich/limps-headless'],
      'limps-headless': {
        cacheDir: '~/Library/Application Support/limps-headless',
      },
    };
    writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');

    const config = loadConfig(configPath);
    const extensionConfig = (config as Record<string, unknown>)['limps-headless'] as Record<
      string,
      unknown
    >;

    expect(config.extensions).toEqual(['@sudosandwich/limps-headless']);
    expect(extensionConfig).toBeDefined();
    expect(extensionConfig.cacheDir).toBe('~/Library/Application Support/limps-headless');
  });

  it('should use default configuration when file does not exist', () => {
    const config = loadConfig(configPath);
    expect(config.plansPath).toBeDefined();
    expect(config.dataPath).toBeDefined();
    // File should be created with defaults
    expect(existsSync(configPath)).toBe(true);
  });

  it('should resolve paths relative to config file location', () => {
    const configData: ServerConfig = {
      plansPath: './plans',
      dataPath: './data',
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
    };
    writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');

    const config = loadConfig(configPath);
    // Paths should be resolved relative to config file
    expect(config.plansPath).toContain(configDir);
    expect(config.dataPath).toContain(configDir);
  });

  it('should expand tilde in paths', () => {
    const home = homedir();
    const configData = {
      plansPath: '~/Documents/plans',
      dataPath: '~/Library/limps/data',
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
    };
    writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');

    const config = loadConfig(configPath);
    // Tilde should be expanded to home directory
    expect(config.plansPath).toBe(join(home, 'Documents/plans'));
    expect(config.dataPath).toBe(join(home, 'Library/limps/data'));
  });

  it('should expand tilde in docsPaths', () => {
    const home = homedir();
    const configData = {
      plansPath: '~/plans',
      docsPaths: ['~/Documents/docs1', '~/Documents/docs2'],
      dataPath: '~/data',
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
    };
    writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');

    const config = loadConfig(configPath);
    expect(config.docsPaths).toEqual([
      join(home, 'Documents/docs1'),
      join(home, 'Documents/docs2'),
    ]);
  });

  it('should strip deprecated coordinationPath and related keys from config when loading', () => {
    const configData = {
      plansPath: join(configDir, 'plans'),
      dataPath: join(configDir, 'data'),
      coordinationPath: './data/coordination.json',
      heartbeatTimeout: 300000,
      debounceDelay: 200,
      maxHandoffIterations: 3,
      scoring: {
        weights: { dependency: 40, priority: 30, workload: 30 },
        biases: {},
      },
    };
    writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');

    loadConfig(configPath);

    const saved = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(saved.coordinationPath).toBeUndefined();
    expect(saved.heartbeatTimeout).toBeUndefined();
    expect(saved.debounceDelay).toBeUndefined();
    expect(saved.maxHandoffIterations).toBeUndefined();
    expect(saved.plansPath).toBeDefined();
    expect(saved.scoring).toBeDefined();
  });

  it('should remove deprecated coordination.json from config dir and data dir when loading', () => {
    const configData: ServerConfig = {
      plansPath: join(configDir, 'plans'),
      dataPath: join(configDir, 'data'),
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
    };
    writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');
    const coordinationInConfigDir = join(configDir, 'coordination.json');
    writeFileSync(coordinationInConfigDir, '{}', 'utf-8');
    mkdirSync(join(configDir, 'data'), { recursive: true });
    const coordinationInDataDir = join(configDir, 'data', 'coordination.json');
    writeFileSync(coordinationInDataDir, '{}', 'utf-8');

    loadConfig(configPath);

    expect(existsSync(coordinationInConfigDir)).toBe(false);
    expect(existsSync(coordinationInDataDir)).toBe(false);
  });
});

describe('expandTilde', () => {
  const home = homedir();

  it('expands ~ to home directory', () => {
    expect(expandTilde('~')).toBe(home);
  });

  it('expands ~/ prefix to home directory', () => {
    expect(expandTilde('~/Documents')).toBe(join(home, 'Documents'));
    expect(expandTilde('~/foo/bar/baz')).toBe(join(home, 'foo/bar/baz'));
  });

  it('does not expand ~ in middle of path', () => {
    expect(expandTilde('/path/to/~/file')).toBe('/path/to/~/file');
  });

  it('does not expand ~user syntax', () => {
    expect(expandTilde('~user/path')).toBe('~user/path');
  });

  it('returns non-tilde paths unchanged', () => {
    expect(expandTilde('/absolute/path')).toBe('/absolute/path');
    expect(expandTilde('./relative/path')).toBe('./relative/path');
    expect(expandTilde('relative/path')).toBe('relative/path');
  });
});
