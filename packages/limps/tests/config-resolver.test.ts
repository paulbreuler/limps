import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { resolveConfigPath } from '../src/utils/config-resolver.js';

describe('resolveConfigPath', () => {
  let testDir: string;
  let originalCwd: string;
  const envBackup = { ...process.env };

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = join(tmpdir(), `limps-config-resolver-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);
    delete process.env.MCP_PLANNING_CONFIG;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = { ...envBackup };
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('throws when no config is found anywhere', () => {
    expect(() => resolveConfigPath()).toThrow('No config found');
  });

  it('resolves CLI --config path', () => {
    const configPath = join(testDir, 'config.json');
    writeFileSync(configPath, '{}');
    expect(resolveConfigPath(configPath)).toBe(configPath);
  });

  it('resolves MCP_PLANNING_CONFIG env var', () => {
    const configPath = join(testDir, 'config.json');
    writeFileSync(configPath, '{}');
    process.env.MCP_PLANNING_CONFIG = configPath;
    expect(resolveConfigPath()).toBe(configPath);
  });

  it('CLI --config takes priority over env var', () => {
    const cliPath = join(testDir, 'cli-config.json');
    const envPath = join(testDir, 'env-config.json');
    writeFileSync(cliPath, '{}');
    writeFileSync(envPath, '{}');
    process.env.MCP_PLANNING_CONFIG = envPath;
    expect(resolveConfigPath(cliPath)).toBe(cliPath);
  });

  it('throws when CLI config directory does not exist', () => {
    expect(() => resolveConfigPath('/nonexistent/dir/config.json')).toThrow(
      'Config directory not found'
    );
  });

  it('finds .limps/config.json in current directory', () => {
    const limpsDir = join(testDir, '.limps');
    mkdirSync(limpsDir);
    const configPath = join(limpsDir, 'config.json');
    writeFileSync(configPath, '{}');
    expect(realpathSync(resolveConfigPath())).toBe(realpathSync(configPath));
  });

  it('finds .limps/config.json in parent directory', () => {
    const limpsDir = join(testDir, '.limps');
    mkdirSync(limpsDir);
    const configPath = join(limpsDir, 'config.json');
    writeFileSync(configPath, '{}');

    const subDir = join(testDir, 'sub', 'nested');
    mkdirSync(subDir, { recursive: true });
    process.chdir(subDir);

    expect(realpathSync(resolveConfigPath())).toBe(realpathSync(configPath));
  });

  it('CLI --config takes priority over local .limps/config.json', () => {
    const limpsDir = join(testDir, '.limps');
    mkdirSync(limpsDir);
    const localConfigPath = join(limpsDir, 'config.json');
    writeFileSync(localConfigPath, '{}');

    const cliPath = join(testDir, 'cli-config.json');
    writeFileSync(cliPath, '{}');

    expect(resolveConfigPath(cliPath)).toBe(cliPath);
  });

  it('env var takes priority over local .limps/config.json', () => {
    const limpsDir = join(testDir, '.limps');
    mkdirSync(limpsDir);
    const localConfigPath = join(limpsDir, 'config.json');
    writeFileSync(localConfigPath, '{}');

    const envPath = join(testDir, 'env-config.json');
    writeFileSync(envPath, '{}');
    process.env.MCP_PLANNING_CONFIG = envPath;

    expect(resolveConfigPath()).toBe(envPath);
  });
});
