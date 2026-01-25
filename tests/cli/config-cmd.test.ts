import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import {
  configList,
  configUse,
  configShow,
  configPath,
  configAdd,
  configRemove,
  configSet,
  configDiscover,
} from '../../src/cli/config-cmd.js';
import { registerProject, setCurrentProject, loadRegistry } from '../../src/cli/registry.js';
import * as osPaths from '../../src/utils/os-paths.js';

describe('config-cmd', () => {
  let testDir: string;
  let configDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `test-config-cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    configDir = join(testDir, 'configs');
    mkdirSync(configDir, { recursive: true });

    // Mock getOSBasePath to use test directory
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

  // Helper to create a valid config file
  function createConfig(name: string): string {
    const configPath = join(configDir, `${name}-config.json`);
    const config = {
      plansPath: join(testDir, name, 'plans'),
      dataPath: join(testDir, name, 'data'),
      coordinationPath: join(testDir, name, 'coordination.json'),
      heartbeatTimeout: 300000,
      debounceDelay: 200,
      maxHandoffIterations: 3,
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    return configPath;
  }

  describe('configList', () => {
    it('returns message when no projects registered', () => {
      const output = configList();

      expect(output).toContain('No projects registered');
      expect(output).toContain('limps init');
    });

    it('lists all registered projects', () => {
      const configA = createConfig('project-a');
      const configB = createConfig('project-b');

      registerProject('project-a', configA);
      registerProject('project-b', configB);

      const output = configList();

      expect(output).toContain('project-a');
      expect(output).toContain('project-b');
      expect(output).toContain(configA);
      expect(output).toContain(configB);
    });

    it('marks current project with asterisk', () => {
      const configA = createConfig('project-a');
      registerProject('project-a', configA);
      setCurrentProject('project-a');

      const output = configList();

      expect(output).toContain('*');
    });

    it('shows missing indicator for deleted config files', () => {
      registerProject('missing-project', '/nonexistent/config.json');

      const output = configList();

      expect(output).toContain('(missing)');
    });
  });

  describe('configUse', () => {
    it('switches to specified project', () => {
      const configPath = createConfig('my-project');
      registerProject('my-project', configPath);

      const output = configUse('my-project');

      expect(output).toContain('Switched to project "my-project"');

      const registry = loadRegistry();
      expect(registry.current).toBe('my-project');
    });

    it('throws error for unknown project', () => {
      expect(() => configUse('nonexistent')).toThrow('Project not found: nonexistent');
    });
  });

  describe('configShow', () => {
    it('shows configuration for resolved config path', () => {
      const configPath = createConfig('test-project');

      const output = configShow(() => configPath);

      expect(output).toContain('Config file:');
      expect(output).toContain('plansPath:');
      expect(output).toContain('dataPath:');
      expect(output).toContain('coordinationPath:');
      expect(output).toContain('heartbeatTimeout:');
    });

    it('returns error message when config file not found', () => {
      const output = configShow(() => '/nonexistent/config.json');

      expect(output).toContain('Config file not found');
      expect(output).toContain('limps init');
    });
  });

  describe('configPath', () => {
    it('returns the resolved config path', () => {
      const expected = '/path/to/config.json';

      const output = configPath(() => expected);

      expect(output).toBe(expected);
    });
  });

  describe('configAdd', () => {
    it('registers an existing config file', () => {
      const existingConfig = createConfig('legacy');

      const output = configAdd('legacy-project', existingConfig);

      expect(output).toContain('Registered project "legacy-project"');
      expect(output).toContain(existingConfig);

      const registry = loadRegistry();
      expect(registry.projects['legacy-project']).toBeDefined();
      expect(registry.projects['legacy-project'].configPath).toBe(existingConfig);
    });

    it('throws error when config file does not exist', () => {
      expect(() => configAdd('bad', '/nonexistent/config.json')).toThrow('Config file not found');
    });

    it('throws error when config file is invalid', () => {
      const invalidConfig = join(configDir, 'invalid.json');
      writeFileSync(invalidConfig, 'not json');

      expect(() => configAdd('invalid', invalidConfig)).toThrow('Invalid config file');
    });
  });

  describe('configRemove', () => {
    it('removes project from registry', () => {
      const configPath = createConfig('to-remove');
      registerProject('to-remove', configPath);

      const output = configRemove('to-remove');

      expect(output).toContain('Removed project "to-remove"');
      expect(output).toContain('files not deleted');

      const registry = loadRegistry();
      expect(registry.projects['to-remove']).toBeUndefined();
    });

    it('throws error for unknown project', () => {
      expect(() => configRemove('nonexistent')).toThrow('Project not found: nonexistent');
    });
  });

  describe('configSet', () => {
    it('registers and sets current from config path', () => {
      // Create a config in a named directory
      const projectDir = join(configDir, 'my-project');
      mkdirSync(projectDir, { recursive: true });
      const configFilePath = join(projectDir, 'config.json');
      const config = {
        plansPath: join(testDir, 'plans'),
        dataPath: join(testDir, 'data'),
        coordinationPath: join(testDir, 'coordination.json'),
        heartbeatTimeout: 300000,
        debounceDelay: 200,
        maxHandoffIterations: 3,
      };
      writeFileSync(configFilePath, JSON.stringify(config, null, 2));

      const output = configSet(configFilePath);

      expect(output).toContain('my-project');
      expect(output).toContain('Registered and switched');

      const registry = loadRegistry();
      expect(registry.current).toBe('my-project');
      expect(registry.projects['my-project'].configPath).toBe(configFilePath);
    });

    it('switches to existing project if already registered', () => {
      const configFilePath = createConfig('existing');
      registerProject('existing', configFilePath);

      const output = configSet(configFilePath);

      expect(output).toContain('Switched to project "existing"');
    });

    it('throws error when config file does not exist', () => {
      expect(() => configSet('/nonexistent/config.json')).toThrow('Config file not found');
    });

    it('throws error when config file is invalid', () => {
      const invalidConfig = join(configDir, 'bad-project', 'config.json');
      mkdirSync(dirname(invalidConfig), { recursive: true });
      writeFileSync(invalidConfig, 'not json');

      expect(() => configSet(invalidConfig)).toThrow('Invalid config file');
    });
  });

  describe('configDiscover', () => {
    it('returns message when no new projects found', () => {
      const output = configDiscover();

      expect(output).toContain('No new projects discovered');
    });

    it('discovers and registers projects in default locations', () => {
      // Create a project in the mocked default location
      const projectDir = join(testDir, 'discover-project');
      mkdirSync(projectDir, { recursive: true });
      const config = {
        plansPath: join(projectDir, 'plans'),
        dataPath: join(projectDir, 'data'),
        coordinationPath: join(projectDir, 'coordination.json'),
        heartbeatTimeout: 300000,
        debounceDelay: 200,
        maxHandoffIterations: 3,
      };
      writeFileSync(join(projectDir, 'config.json'), JSON.stringify(config, null, 2));

      const output = configDiscover();

      expect(output).toContain('Discovered');
      expect(output).toContain('discover-project');

      const registry = loadRegistry();
      expect(registry.projects['discover-project']).toBeDefined();
    });

    it('skips already registered projects', () => {
      // Create and register a project
      const projectDir = join(testDir, 'already-registered');
      mkdirSync(projectDir, { recursive: true });
      const configFilePath = join(projectDir, 'config.json');
      const config = {
        plansPath: join(projectDir, 'plans'),
        dataPath: join(projectDir, 'data'),
        coordinationPath: join(projectDir, 'coordination.json'),
        heartbeatTimeout: 300000,
        debounceDelay: 200,
        maxHandoffIterations: 3,
      };
      writeFileSync(configFilePath, JSON.stringify(config, null, 2));
      registerProject('already-registered', configFilePath);

      const output = configDiscover();

      expect(output).toContain('No new projects discovered');
    });
  });
});
