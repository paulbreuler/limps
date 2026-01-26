import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
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
    };
    writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');

    const config = loadConfig(configPath);
    expect(config.plansPath).toBe(configData.plansPath);
    expect(config.dataPath).toBe(configData.dataPath);
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
    };
    writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');

    const config = loadConfig(configPath);
    expect(config.docsPaths).toEqual([
      join(home, 'Documents/docs1'),
      join(home, 'Documents/docs2'),
    ]);
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
