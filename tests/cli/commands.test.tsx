import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as osPaths from '../../src/utils/os-paths.js';

describe('Pastel CLI Commands', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `test-pastel-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });

    // Mock getOSBasePath to use test directory - same pattern as registry.test.ts
    vi.spyOn(osPaths, 'getOSBasePath').mockImplementation((appName?: string) => {
      return join(testDir, appName || 'limps');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('config/list command', () => {
    it('renders empty state when no projects registered', async () => {
      const { default: ConfigListCommand } = await import('../../src/commands/config/list.js');

      const { lastFrame } = render(<ConfigListCommand options={{}} />);

      expect(lastFrame()).toContain('No projects registered');
    });

    it('renders project list when projects exist', async () => {
      // Need to import registry after mock is set up
      const { registerProject } = await import('../../src/cli/registry.js');
      registerProject('test-project', '/path/to/config.json');

      const { default: ConfigListCommand } = await import('../../src/commands/config/list.js');

      const { lastFrame } = render(<ConfigListCommand options={{}} />);

      expect(lastFrame()).toContain('test-project');
      expect(lastFrame()).toContain('/path/to/config.json');
    });
  });

  describe('config/use command', () => {
    it('switches to specified project', async () => {
      const { registerProject } = await import('../../src/cli/registry.js');
      registerProject('project-a', '/path/to/a/config.json');
      registerProject('project-b', '/path/to/b/config.json');

      const { default: ConfigUseCommand } = await import('../../src/commands/config/use.js');

      const { lastFrame } = render(<ConfigUseCommand args={['project-a']} />);

      expect(lastFrame()).toContain('Switched to project');
      expect(lastFrame()).toContain('project-a');
    });

    it('shows error for non-existent project', async () => {
      const { default: ConfigUseCommand } = await import('../../src/commands/config/use.js');

      const { lastFrame } = render(<ConfigUseCommand args={['nonexistent']} />);

      expect(lastFrame()).toContain('Error');
    });
  });

  describe('config/path command', () => {
    it('prints resolved config path', async () => {
      const configPath = join(testDir, 'my-project', 'config.json');
      mkdirSync(join(testDir, 'my-project'), { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify({
          plansPath: '/plans',
          dataPath: '/data',
          scoring: {
            weights: {
              dependency: 40,
              priority: 30,
              workload: 30,
            },
            biases: {},
          },
        })
      );

      const { registerProject, setCurrentProject } = await import('../../src/cli/registry.js');
      registerProject('my-project', configPath);
      setCurrentProject('my-project');

      const { default: ConfigPathCommand } = await import('../../src/commands/config/path.js');

      const { lastFrame } = render(<ConfigPathCommand />);
      // Join lines since Ink may wrap long paths
      const output = (lastFrame() ?? '').replace(/\n/g, '');

      // Check that the config path is in the output
      expect(output).toContain(configPath);
    });
  });

  describe('list-plans command', () => {
    it('renders plan list', async () => {
      const plansDir = join(testDir, 'plans');
      const planDir = join(plansDir, '0001-test-plan');
      mkdirSync(planDir, { recursive: true });
      writeFileSync(join(planDir, 'plan.md'), '# Test Plan\n\nDescription here.');

      const configPath = join(testDir, 'project', 'config.json');
      mkdirSync(join(testDir, 'project'), { recursive: true });
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
        })
      );

      const { registerProject, setCurrentProject } = await import('../../src/cli/registry.js');
      registerProject('test-project', configPath);
      setCurrentProject('test-project');

      const { default: ListPlansCommand } = await import('../../src/commands/list-plans.js');

      const { lastFrame } = render(<ListPlansCommand options={{}} />);

      expect(lastFrame()).toContain('Test Plan');
      expect(lastFrame()).toContain('0001');
    });

    it('shows empty state when no plans', async () => {
      const plansDir = join(testDir, 'plans');
      mkdirSync(plansDir, { recursive: true });

      const configPath = join(testDir, 'project', 'config.json');
      mkdirSync(join(testDir, 'project'), { recursive: true });
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
        })
      );

      const { registerProject, setCurrentProject } = await import('../../src/cli/registry.js');
      registerProject('test-project', configPath);
      setCurrentProject('test-project');

      const { default: ListPlansCommand } = await import('../../src/commands/list-plans.js');

      const { lastFrame } = render(<ListPlansCommand options={{}} />);

      expect(lastFrame()).toContain('No plans found');
    });
  });
});
