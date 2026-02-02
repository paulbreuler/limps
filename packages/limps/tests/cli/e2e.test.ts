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
  cwd?: string
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      cwd: cwd || process.cwd(),
      env: { ...process.env },
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
      expect(result.stdout).toContain('version');
    });

    it('should show version command output', async () => {
      const result = await runCli(['version']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/@sudosandwich\/limps/);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    it('should handle version --check without crashing', async () => {
      const result = await runCli(['version', '--check']);

      // Should exit 0 or 1 (no crash; 1 if network check fails)
      expect([0, 1]).toContain(result.exitCode);
      // In CI/non-TTY output may be empty or on either stream; avoid asserting on content
    });

    it('should show default command help', async () => {
      const result = await runCli([]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('limps');
      expect(result.stdout).toContain('Commands:');
    });
  });

  describe('plan commands', () => {
    it('should list plans without crashing', async () => {
      const result = await runCli(['list-plans', '--config', configPath]);

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

      const result = await runCli(['list-plans', '--config', emptyConfig]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toLowerCase()).toMatch(/no plans|empty/i);
    });

    it('should show status for a plan', async () => {
      const result = await runCli(['status', '0001', '--config', configPath]);

      expect(result.exitCode).toBe(0);
      // Should show some status information
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('should handle status with invalid plan gracefully', async () => {
      const result = await runCli(['status', '9999', '--config', configPath]);

      // Should handle error gracefully (may exit with non-zero or show error message)
      expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
    });
  });

  describe('config commands', () => {
    it('should list config projects', async () => {
      const result = await runCli(['config', 'list']);

      expect(result.exitCode).toBe(0);
      // Should show config list (may be empty)
      expect(result.stdout.length).toBeGreaterThan(0);
    });

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
      const result = await runCli(['list-plans', '--config', '/nonexistent/config.json']);

      // Should show error message, not crash
      expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
    });

    it('should handle missing required arguments gracefully', async () => {
      const result = await runCli(['init']);

      // Should show usage/help, not crash
      expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
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
