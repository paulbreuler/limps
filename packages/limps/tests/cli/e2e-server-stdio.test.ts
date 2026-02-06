/**
 * End-to-end tests for MCP server stdio startup.
 * These tests spawn the server via `node dist/index.js --config <path>`,
 * send a JSON-RPC initialize message over stdin, and validate stderr output.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INDEX_PATH = join(__dirname, '..', '..', 'dist', 'index.js');

/** JSON-RPC initialize message for MCP protocol */
const INITIALIZE_MESSAGE = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'e2e-test', version: '0.0.1' },
  },
});

/**
 * Spawn the MCP server, send an initialize message, and collect stderr.
 * Returns after receiving a JSON-RPC response on stdout or after timeout.
 */
function spawnServer(configPath: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', [INDEX_PATH, '--config', configPath], {
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      resolve({ stdout, stderr });
    };

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
      // Once we get a JSON-RPC response, the server has initialized
      if (stdout.includes('"jsonrpc"')) {
        // Give a brief moment for any trailing stderr output
        setTimeout(finish, 200);
      }
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', () => {
      if (!settled) {
        settled = true;
        resolve({ stdout, stderr });
      }
    });

    child.on('error', (error) => {
      if (!settled) {
        settled = true;
        resolve({ stdout, stderr: stderr + error.message });
      }
    });

    // Send initialize message to stdin
    child.stdin?.write(INITIALIZE_MESSAGE + '\n');

    // Safety timeout — kill after 15s if server hasn't responded
    setTimeout(finish, 15_000);
  });
}

describe('MCP Server stdio E2E', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `limps-stdio-e2e-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should produce clean stderr with a valid config', async () => {
    const plansDir = join(testDir, 'plans');
    const planDir = join(plansDir, '0001-test-feature');
    mkdirSync(planDir, { recursive: true });

    writeFileSync(
      join(planDir, 'plan.md'),
      `---
name: Test Feature
workType: feature
status: WIP
---

# Test Feature Plan
`,
      'utf-8'
    );

    const configPath = join(testDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        plansPath: plansDir,
        dataPath: join(testDir, 'data'),
        scoring: {
          weights: { dependency: 40, priority: 30, workload: 30 },
          biases: {},
        },
      }),
      'utf-8'
    );

    const { stderr } = await spawnServer(configPath);

    // Should show successful indexing
    expect(stderr).toContain('Indexed');
    expect(stderr).toContain('File watcher started');

    // Should NOT produce spurious warnings
    expect(stderr).not.toContain('[limps] plansPath does not exist');
    expect(stderr).not.toContain('Warning: About to index');
  }, 20_000);

  it('should warn on stderr when plansPath does not exist', async () => {
    const configPath = join(testDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        plansPath: join(testDir, 'nonexistent-plans'),
        dataPath: join(testDir, 'data'),
        scoring: {
          weights: { dependency: 40, priority: 30, workload: 30 },
          biases: {},
        },
      }),
      'utf-8'
    );

    const { stderr } = await spawnServer(configPath);

    // Should produce the missing plansPath warning
    expect(stderr).toContain('[limps] plansPath does not exist');
    expect(stderr).toContain('No valid paths to index');
  }, 20_000);
});
