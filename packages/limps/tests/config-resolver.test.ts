import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync, rmSync } from 'fs';
import * as osPaths from '../src/utils/os-paths.js';
import { resolveConfigPath } from '../src/utils/config-resolver.js';

describe('resolveConfigPath', () => {
  let testDir: string;
  const envBackup = { ...process.env };

  beforeEach(() => {
    testDir = join(tmpdir(), `limps-config-resolver-${Date.now()}`);
    vi.spyOn(osPaths, 'getOSBasePath').mockImplementation((appName?: string) => {
      return join(testDir, appName || 'limps');
    });
    vi.spyOn(osPaths, 'getOSConfigPath').mockImplementation((appName?: string) => {
      return join(testDir, appName || 'limps', 'config.json');
    });
    delete process.env.MCP_PLANNING_CONFIG;
    delete process.env.LIMPS_PROJECT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...envBackup };
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('throws when no overrides are set', () => {
    expect(() => resolveConfigPath()).toThrow('No config found');
  });
});
