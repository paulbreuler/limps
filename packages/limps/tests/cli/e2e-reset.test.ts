/**
 * End-to-end tests for `limps reset` command.
 * Runs consecutive init -> reset cycles to prove no residual state.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_PATH = join(__dirname, '..', '..', 'dist', 'cli.js');

/**
 * Execute CLI command and return stdout/stderr/exit code.
 */
function runCli(
  args: string[],
  options?: { cwd?: string; env?: Record<string, string | undefined> }
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise((resolve) => {
    const overrides = options?.env ?? {};
    const removedKeys = new Set(
      Object.entries(overrides)
        .filter(([, v]) => v === undefined)
        .map(([k]) => k)
    );
    const env = Object.fromEntries(
      Object.entries({ ...process.env, ...overrides }).filter(
        ([k, v]) => v !== undefined && !removedKeys.has(k)
      )
    );

    const child = spawn('node', [CLI_PATH, ...args], {
      cwd: options?.cwd || process.cwd(),
      env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });

    child.on('error', (error) => {
      resolve({ stdout, stderr: stderr + error.message, exitCode: 1 });
    });
  });
}

describe('E2E reset cycles', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `limps-e2e-reset-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  /** Environment that isolates limps state. */
  function isolatedEnv(): Record<string, string | undefined> {
    return {
      MCP_PLANNING_CONFIG: undefined,
    };
  }

  it('3 consecutive init -> reset cycles leave no residual state', async () => {
    for (let cycle = 1; cycle <= 3; cycle++) {
      const projectDir = join(testDir, `project-${cycle}`);
      mkdirSync(projectDir, { recursive: true });

      const limpsDir = join(projectDir, '.limps');
      const configPath = join(limpsDir, 'config.json');
      const dataDir = join(limpsDir, 'data');

      // 1. Init project
      const initResult = await runCli(['init', projectDir], {
        env: isolatedEnv(),
      });

      expect(
        initResult.exitCode,
        `Cycle ${cycle} init failed: ${initResult.stdout + initResult.stderr}`
      ).toBe(0);

      // 2. Verify .limps/config.json exists
      expect(existsSync(configPath)).toBe(true);

      // 3. Reset without --force (dry run)
      const dryResult = await runCli(['reset', '--config', configPath], {
        env: isolatedEnv(),
      });
      expect(dryResult.exitCode).toBe(0);
      expect(dryResult.stdout).toContain('Run with --force to confirm');
      // State should still exist after dry run
      expect(existsSync(configPath)).toBe(true);

      // 4. Reset with --force
      const resetResult = await runCli(['reset', '--force', '--config', configPath], {
        env: isolatedEnv(),
      });
      expect(
        resetResult.exitCode,
        `Cycle ${cycle} reset failed: ${resetResult.stdout + resetResult.stderr}`
      ).toBe(0);

      // 5. Verify data directory is cleaned
      expect(existsSync(dataDir)).toBe(false);
    }
  }, 60_000);

  it('reset --force on empty state reports config not found', async () => {
    const fakePath = join(testDir, 'nonexistent', '.limps', 'config.json');
    mkdirSync(join(testDir, 'nonexistent', '.limps'), { recursive: true });

    const result = await runCli(['reset', '--force', '--config', fakePath], {
      env: isolatedEnv(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Config file not found');
  });
});
