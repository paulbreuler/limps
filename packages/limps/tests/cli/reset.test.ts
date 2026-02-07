import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { resetAll } from '../../src/cli/config-cmd.js';
import * as pidfile from '../../src/pidfile.js';

describe('resetAll', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-reset-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  /** Create a project config + data directory under testDir. */
  function setupProject(): {
    configPath: string;
    dataPath: string;
  } {
    const limpsDir = join(testDir, '.limps');
    const configPath = join(limpsDir, 'config.json');
    const dataPath = join(limpsDir, 'data');

    mkdirSync(dataPath, { recursive: true });

    // Create a SQLite-like file in dataPath to simulate real usage
    writeFileSync(join(dataPath, 'documents.sqlite'), 'fake-db');

    const config = {
      configVersion: 1,
      plansPath: join(testDir, 'plans'),
      dataPath,
      docsPaths: [testDir],
      fileExtensions: ['.md'],
      scoring: {
        weights: { dependency: 40, priority: 30, workload: 30 },
        biases: {},
      },
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    return { configPath, dataPath };
  }

  it('returns error for non-existent config', () => {
    const fakePath = join(testDir, 'nonexistent', 'config.json');
    const log = resetAll(fakePath);

    expect(log).toEqual([`Config file not found: ${fakePath}`]);
  });

  it('returns dry-run info without --force', () => {
    const { configPath, dataPath } = setupProject();

    const log = resetAll(configPath, { force: false });

    const logText = log.join('\n');
    expect(logText).toContain('The following will be deleted');
    expect(logText).toContain(dataPath);
    expect(logText).toContain('Run with --force to confirm');
  });

  it('deletes dataPath with --force', () => {
    const { configPath, dataPath } = setupProject();

    // Verify data exists before reset
    expect(existsSync(dataPath)).toBe(true);
    expect(existsSync(join(dataPath, 'documents.sqlite'))).toBe(true);

    const log = resetAll(configPath, { force: true });

    // Verify data directory is gone
    expect(existsSync(dataPath)).toBe(false);

    const logText = log.join('\n');
    expect(logText).toContain('Deleted data dir');
  });

  it('stops running daemon', () => {
    const { configPath, dataPath } = setupProject();

    // Mock getRunningDaemon to return a fake daemon
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    vi.spyOn(pidfile, 'getRunningDaemon').mockReturnValue({
      pid: 99999,
      port: 3000,
      host: 'localhost',
      startedAt: new Date().toISOString(),
    });
    const removePidSpy = vi.spyOn(pidfile, 'removePidFile').mockImplementation(() => {});

    const log = resetAll(configPath, { force: true });
    const logText = log.join('\n');

    expect(logText).toContain('Stopped daemon');
    expect(logText).toContain('PID 99999');
    expect(killSpy).toHaveBeenCalledWith(99999, 'SIGTERM');
    expect(removePidSpy).toHaveBeenCalledWith(pidfile.getPidFilePath(dataPath));
  });

  it('handles corrupt config gracefully', () => {
    const limpsDir = join(testDir, '.limps');
    const configPath = join(limpsDir, 'config.json');
    mkdirSync(limpsDir, { recursive: true });
    writeFileSync(configPath, 'NOT VALID JSON!!!');

    const log = resetAll(configPath, { force: true });
    const logText = log.join('\n');

    expect(logText).toContain('Failed to load config');
  });
});
