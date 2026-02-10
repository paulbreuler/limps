import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliPath = join(__dirname, '../../dist/cli.js');

describe('config show-resolution command', () => {
  let testDir: string;
  let originalCwd: string;
  const envBackup = { ...process.env };

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = join(tmpdir(), `limps-config-show-resolution-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    delete process.env.MCP_PLANNING_CONFIG;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = { ...envBackup };
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('shows no config found when none exists', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, 'config', 'show-resolution'], {
      cwd: testDir,
    });

    expect(stdout).toContain('Config Resolution Debug Info');
    expect(stdout).toContain('Priority 1: CLI --config argument');
    expect(stdout).toContain('Not provided');
    expect(stdout).toContain('Priority 2: MCP_PLANNING_CONFIG environment variable');
    expect(stdout).toContain('Not set');
    expect(stdout).toContain('Priority 3: Local .limps/config.json');
    expect(stdout).toContain('No .limps/config.json found');
    expect(stdout).toContain('ERROR: No config found');
  });

  it('shows local config when it exists', async () => {
    const limpsDir = join(testDir, '.limps');
    mkdirSync(limpsDir);
    const configPath = join(limpsDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        configVersion: 3,
        plansPath: join(testDir, 'plans'),
        dataPath: join(testDir, '.limps', 'data'),
      })
    );

    const { stdout } = await execFileAsync('node', [cliPath, 'config', 'show-resolution'], {
      cwd: testDir,
    });

    expect(stdout).toContain('Priority 3: Local .limps/config.json');
    expect(stdout).toContain('Found 1 config(s)');
    expect(stdout).toContain(configPath);
    expect(stdout).toContain('✓');
    expect(stdout).toContain('Will use: Local search');
  });

  it('shows CLI argument takes priority', async () => {
    const limpsDir = join(testDir, '.limps');
    mkdirSync(limpsDir);
    const localConfig = join(limpsDir, 'config.json');
    const cliConfig = join(testDir, 'cli-config.json');

    writeFileSync(
      localConfig,
      JSON.stringify({
        configVersion: 3,
        plansPath: join(testDir, 'plans'),
        dataPath: join(testDir, '.limps', 'data'),
      })
    );
    writeFileSync(
      cliConfig,
      JSON.stringify({
        configVersion: 3,
        plansPath: join(testDir, 'other-plans'),
        dataPath: join(testDir, 'other-data'),
      })
    );

    const { stdout } = await execFileAsync(
      'node',
      [cliPath, 'config', 'show-resolution', '--config', cliConfig],
      { cwd: testDir }
    );

    expect(stdout).toContain('Priority 1: CLI --config argument');
    expect(stdout).toContain(`Provided: ${cliConfig}`);
    expect(stdout).toContain('Exists: YES');
    expect(stdout).toContain('✓ This config will be used');
    expect(stdout).toContain('Will use: CLI argument');
    expect(stdout).toContain(cliConfig);
  });

  it('shows env var when set', async () => {
    const limpsDir = join(testDir, '.limps');
    mkdirSync(limpsDir);
    const envConfig = join(limpsDir, 'config.json');

    writeFileSync(
      envConfig,
      JSON.stringify({
        configVersion: 3,
        plansPath: join(testDir, 'plans'),
        dataPath: join(testDir, '.limps', 'data'),
      })
    );

    const { stdout } = await execFileAsync('node', [cliPath, 'config', 'show-resolution'], {
      cwd: testDir,
      env: { ...process.env, MCP_PLANNING_CONFIG: envConfig },
    });

    expect(stdout).toContain('Priority 2: MCP_PLANNING_CONFIG environment variable');
    expect(stdout).toContain('Exists: YES');
    expect(stdout).toContain('✓ This config will be used');
    expect(stdout).toContain('Will use: MCP_PLANNING_CONFIG');
    expect(stdout).toContain(envConfig);
  });

  it('shows all configs found in parent directories', async () => {
    // Create nested structure with configs
    const parentDir = join(testDir, 'parent');
    const childDir = join(parentDir, 'child');
    mkdirSync(join(parentDir, '.limps'), { recursive: true });
    mkdirSync(join(childDir, '.limps'), { recursive: true });

    const parentConfig = join(parentDir, '.limps', 'config.json');
    const childConfig = join(childDir, '.limps', 'config.json');

    writeFileSync(
      parentConfig,
      JSON.stringify({
        configVersion: 3,
        plansPath: join(parentDir, 'plans'),
        dataPath: join(parentDir, '.limps', 'data'),
      })
    );
    writeFileSync(
      childConfig,
      JSON.stringify({
        configVersion: 3,
        plansPath: join(childDir, 'plans'),
        dataPath: join(childDir, '.limps', 'data'),
      })
    );

    const { stdout } = await execFileAsync('node', [cliPath, 'config', 'show-resolution'], {
      cwd: childDir,
    });

    expect(stdout).toContain('Found 2 config(s)');
    expect(stdout).toContain(childConfig);
    expect(stdout).toContain(parentConfig);
    expect(stdout).toContain('✓');
    expect(stdout).toContain('First config found will be used');
  });

  it('shows env var takes priority over local config', async () => {
    const limpsDir = join(testDir, '.limps');
    mkdirSync(limpsDir);
    const localConfig = join(limpsDir, 'config.json');

    const envDir = join(testDir, 'env-location', '.limps');
    mkdirSync(envDir, { recursive: true });
    const envConfig = join(envDir, 'config.json');

    writeFileSync(
      localConfig,
      JSON.stringify({
        configVersion: 3,
        plansPath: join(testDir, 'plans'),
        dataPath: join(testDir, '.limps', 'data'),
      })
    );
    writeFileSync(
      envConfig,
      JSON.stringify({
        configVersion: 3,
        plansPath: join(testDir, 'env-location', 'plans'),
        dataPath: join(testDir, 'env-location', '.limps', 'data'),
      })
    );

    const { stdout } = await execFileAsync('node', [cliPath, 'config', 'show-resolution'], {
      cwd: testDir,
      env: { ...process.env, MCP_PLANNING_CONFIG: envConfig },
    });

    expect(stdout).toContain('Priority 2: MCP_PLANNING_CONFIG environment variable');
    expect(stdout).toContain('✓ This config will be used');
    expect(stdout).toContain('Will use: MCP_PLANNING_CONFIG');
    expect(stdout).toContain(envConfig);
    // Local config should be listed but not marked as used
    expect(stdout).toContain(localConfig);
    expect(stdout).not.toContain('✓ First config found will be used');
  });
});
