import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { resolveConfigPath } from '../src/utils/config-resolver.js';

describe('resolveConfigPath', () => {
  let testDir: string;
  const envBackup = { ...process.env };

  beforeEach(() => {
    testDir = join(tmpdir(), `limps-config-resolver-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    delete process.env.MCP_PLANNING_CONFIG;
  });

  afterEach(() => {
    process.env = { ...envBackup };
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('throws when no overrides are set', () => {
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
});
