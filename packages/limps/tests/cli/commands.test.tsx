import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Pastel CLI Commands', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `test-pastel-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  /** Create a config.json in testDir and return its path. */
  function createConfig(overrides: Record<string, unknown> = {}): string {
    const projectDir = join(testDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    const configPath = join(projectDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        plansPath: overrides.plansPath ?? join(testDir, 'plans'),
        dataPath: overrides.dataPath ?? join(testDir, 'data'),
        docsPaths: [testDir],
        fileExtensions: ['.md'],
        scoring: {
          weights: { dependency: 40, priority: 30, workload: 30 },
          biases: {},
        },
        ...overrides,
      })
    );
    return configPath;
  }

  describe('config/path command', () => {
    it('prints resolved config path', async () => {
      const configPath = createConfig();

      const { default: ConfigPathCommand } = await import('../../src/commands/config/path.js');

      // ConfigPathCommand uses resolveConfigPath() internally, which reads from
      // the MCP_PLANNING_CONFIG env var or --config flag. We set the env var
      // so the component can resolve it.
      const originalEnv = process.env.MCP_PLANNING_CONFIG;
      process.env.MCP_PLANNING_CONFIG = configPath;
      try {
        const { lastFrame } = render(<ConfigPathCommand />);
        const output = (lastFrame() ?? '').replace(/\n/g, '');
        expect(output).toContain(configPath);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.MCP_PLANNING_CONFIG;
        } else {
          process.env.MCP_PLANNING_CONFIG = originalEnv;
        }
      }
    });
  });

  describe('list-plans command', () => {
    it('renders plan list', async () => {
      const plansDir = join(testDir, 'plans');
      const planDir = join(plansDir, '0001-test-plan');
      mkdirSync(planDir, { recursive: true });
      writeFileSync(join(planDir, 'plan.md'), '# Test Plan\n\nDescription here.');

      const configPath = createConfig({ plansPath: plansDir });

      const { default: ListPlansCommand } = await import('../../src/commands/list-plans.js');

      const { lastFrame } = render(<ListPlansCommand options={{ config: configPath }} />);

      expect(lastFrame()).toContain('Test Plan');
      expect(lastFrame()).toContain('0001');
    });

    it('shows empty state when no plans', async () => {
      const plansDir = join(testDir, 'plans');
      mkdirSync(plansDir, { recursive: true });

      const configPath = createConfig({ plansPath: plansDir });

      const { default: ListPlansCommand } = await import('../../src/commands/list-plans.js');

      const { lastFrame } = render(<ListPlansCommand options={{ config: configPath }} />);

      expect(lastFrame()).toContain('No plans found');
    });
  });
});
