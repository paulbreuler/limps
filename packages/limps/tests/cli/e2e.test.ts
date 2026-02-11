/**
 * End-to-end tests for CLI binary execution.
 * These tests verify the CLI is built correctly and can execute commands
 * without crashing, even without AI/MCP server available.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
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
    // Build env by filtering out keys overridden with undefined
    // to prevent them from being stringified as "undefined" by spawn
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
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 0,
      });
    });

    child.on('error', (error) => {
      resolve({
        stdout,
        stderr: stderr + error.message,
        exitCode: 1,
      });
    });
  });
}

describe('CLI E2E', () => {
  let testDir: string;
  let plansDir: string;
  let configPath: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `limps-e2e-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    configPath = join(testDir, 'config.json');

    mkdirSync(plansDir, { recursive: true });

    // Create a test plan
    const planDir = join(plansDir, '0001-test-feature');
    mkdirSync(planDir, { recursive: true });
    writeFileSync(
      join(planDir, 'plan.md'),
      `---
name: Test Feature
workType: feature
status: WIP
---

# Test Feature

This is a test feature plan.

## Tasks

- [ ] Task 1
- [ ] Task 2
`,
      'utf-8'
    );

    // Create config file
    writeFileSync(
      configPath,
      JSON.stringify({
        plansPath: plansDir,
        dataPath: join(testDir, 'data'),
        scoring: {
          weights: {
            dependency: 40,
            priority: 30,
            workload: 30,
          },
          biases: {},
        },
      }),
      'utf-8'
    );
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('basic commands', () => {
    it('should show help without crashing', async () => {
      const result = await runCli(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('limps');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).not.toContain('__complete');
      expect(result.stdout).toContain('version');
    });

    it('should show version command output', async () => {
      const result = await runCli(['version']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/@sudosandwich\/limps/);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    it('should show default command help', async () => {
      const result = await runCli([]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('limps');
      expect(result.stdout).toContain('Recommended Groups:');
      expect(result.stdout).toContain('Common Commands:');
    });
  });

  describe('plan commands', () => {
    it('should list plans without crashing', async () => {
      const result = await runCli(['plan', 'list', '--config', configPath]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Test Feature');
      expect(result.stdout).toContain('0001');
    });

    it('should handle list-plans with empty directory', async () => {
      const emptyDir = join(testDir, 'empty-plans');
      mkdirSync(emptyDir, { recursive: true });

      const emptyConfig = join(testDir, 'empty-config.json');
      writeFileSync(
        emptyConfig,
        JSON.stringify({
          plansPath: emptyDir,
          dataPath: join(testDir, 'data'),
          scoring: {
            weights: {
              dependency: 40,
              priority: 30,
              workload: 30,
            },
            biases: {},
          },
        }),
        'utf-8'
      );

      const result = await runCli(['plan', 'list', '--config', emptyConfig]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toLowerCase()).toMatch(/no plans|empty/i);
    });

    it('should show status for a plan', async () => {
      const result = await runCli(['plan', 'status', '0001', '--config', configPath]);

      expect(result.exitCode).toBe(0);
      // Should show some status information
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('should handle status with invalid plan gracefully', async () => {
      const result = await runCli(['plan', 'status', '9999', '--config', configPath]);

      // Should handle error gracefully (may exit with non-zero or show error message)
      expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
    });
  });

  describe('config commands', () => {
    it('should show config help', async () => {
      const result = await runCli(['config', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('config');
      expect(result.stdout).toContain('Commands:');
    });
  });

  describe('error handling', () => {
    it('should handle invalid command gracefully', async () => {
      const result = await runCli(['invalid-command']);

      // Should show error or help, not crash
      expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
    });

    it('should handle invalid config path gracefully', async () => {
      const result = await runCli(['plan', 'list', '--config', '/nonexistent/config.json']);

      // Should show error message, not crash
      expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
    });

    it('should handle missing required arguments gracefully', async () => {
      const result = await runCli(['init']);

      // Should show usage/help, not crash
      expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
    });

    it('should return non-zero when plan score is missing required flags', async () => {
      const result = await runCli(['plan', 'score']);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('--plan and --agent are required');
    });

    it('should return non-zero when plan scores is missing required flags', async () => {
      const result = await runCli(['plan', 'scores']);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('--plan is required');
    });

    it('should show clear error when no config is found', async () => {
      // Use isolated directory that has no .limps/config.json in tree
      const isolatedDir = join(tmpdir(), `limps-no-config-${Date.now()}`);
      mkdirSync(isolatedDir, { recursive: true });

      const result = await runCli(['plan', 'list'], {
        cwd: isolatedDir,
        env: {
          HOME: isolatedDir,
          MCP_PLANNING_CONFIG: undefined,
        },
      });

      const output = result.stdout + result.stderr;
      expect(output).toContain('No config found');
      expect(output).toContain('limps init');

      // Clean up
      rmSync(isolatedDir, { recursive: true, force: true });
    });
  });

  describe('init command', () => {
    it('should show init help', async () => {
      const result = await runCli(['init', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('init');
    });
  });
});
