import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import type * as osModule from 'os';
import * as osPaths from '../../src/utils/os-paths.js';

// Track the mock homedir value
let mockHomedirValue: string | null = null;

// Mock the os module's homedir function - must be before importing modules that use it
vi.mock('os', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof osModule;
  return {
    ...actual,
    homedir: (): string => mockHomedirValue ?? actual.homedir(),
  };
});

import * as toml from '@iarna/toml';
import {
  configList,
  configUse,
  configShow,
  configPath,
  configAdd,
  configRemove,
  configSet,
  configDiscover,
  configAddClaude,
  configAddCursor,
  configAddCodex,
  configAddLocalMcp,
  hasLocalMcpJson,
  generateChatGptInstructions,
  generateConfigForPrint,
  configUpdate,
} from '../../src/cli/config-cmd.js';
import { getAdapter } from '../../src/cli/mcp-client-adapter.js';
import {
  registerProject,
  setCurrentProject,
  loadRegistry,
  unregisterProject,
} from '../../src/cli/registry.js';

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

    // Mock OS path functions to use test directory
    vi.spyOn(osPaths, 'getOSBasePath').mockImplementation((appName?: string) => {
      return join(testDir, appName || 'limps');
    });
    vi.spyOn(osPaths, 'getOSConfigPath').mockImplementation((appName?: string) => {
      return join(testDir, appName || 'limps', 'config.json');
    });
    vi.spyOn(osPaths, 'getOSDataPath').mockImplementation((appName?: string) => {
      return join(testDir, appName || 'limps', 'data');
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
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
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
    });

    it('returns error message when config file not found', () => {
      const output = configShow(() => '/nonexistent/config.json');

      expect(output).toContain('Config file not found');
      expect(output).toContain('limps init');
    });

    it('shows scoring config when present', () => {
      const configPath = join(configDir, 'scoring-config.json');
      const config = {
        plansPath: join(testDir, 'plans'),
        dataPath: join(testDir, 'data'),
        scoring: {
          weights: {
            dependency: 50,
            priority: 25,
            workload: 25,
          },
          biases: {},
        },
      };
      writeFileSync(configPath, JSON.stringify(config, null, 2));

      const output = configShow(() => configPath);

      expect(output).toContain('scoring:');
      expect(output).toContain('weights:');
      expect(output).toContain('dependency:');
      expect(output).toContain('50');
      expect(output).toContain('priority:');
      expect(output).toContain('25');
      expect(output).toContain('workload:');
    });

    it('shows scoring biases when present', () => {
      const configPath = join(configDir, 'biases-config.json');
      const config = {
        plansPath: join(testDir, 'plans'),
        dataPath: join(testDir, 'data'),
        scoring: {
          weights: {
            dependency: 40,
            priority: 30,
            workload: 30,
          },
          biases: {
            plans: { '0001-test-plan': 20 },
            personas: { coder: 10, reviewer: -5 },
            statuses: { GAP: 5 },
          },
        },
      };
      writeFileSync(configPath, JSON.stringify(config, null, 2));

      const output = configShow(() => configPath);

      expect(output).toContain('scoring:');
      expect(output).toContain('biases:');
      expect(output).toContain('plans:');
      expect(output).toContain('0001-test-plan: +20');
      expect(output).toContain('personas:');
      expect(output).toContain('coder:');
      expect(output).toContain('+10');
      expect(output).toContain('reviewer:');
      expect(output).toContain('-5');
      expect(output).toContain('statuses:');
      expect(output).toContain('GAP:');
      expect(output).toContain('+5');
    });

    it('shows both weights and biases together', () => {
      const configPath = join(configDir, 'full-scoring-config.json');
      const config = {
        plansPath: join(testDir, 'plans'),
        dataPath: join(testDir, 'data'),
        scoring: {
          weights: {
            dependency: 50,
            priority: 25,
            workload: 25,
          },
          biases: {
            plans: { '0030-limps-scoring': 15 },
          },
        },
      };
      writeFileSync(configPath, JSON.stringify(config, null, 2));

      const output = configShow(() => configPath);

      expect(output).toContain('scoring:');
      expect(output).toContain('weights:');
      expect(output).toContain('dependency:');
      expect(output).toContain('50');
      expect(output).toContain('biases:');
      expect(output).toContain('plans:');
      expect(output).toContain('0030-limps-scoring: +15');
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

    it('throws error when path does not exist', () => {
      expect(() => configAdd('bad', '/nonexistent/config.json')).toThrow('Path not found');
    });

    it('throws error when config file is invalid', () => {
      const invalidConfig = join(configDir, 'invalid.json');
      writeFileSync(invalidConfig, 'not json');

      expect(() => configAdd('invalid', invalidConfig)).toThrow('Invalid config file');
    });

    it('creates config in OS location when given a directory without config.json', () => {
      const projectDir = join(configDir, 'dir-project');
      mkdirSync(projectDir, { recursive: true });
      mkdirSync(join(projectDir, 'plans'), { recursive: true });

      const result = configAdd('dir-proj', projectDir);

      expect(result).toContain('Created config and registered project "dir-proj"');
      expect(result).toContain('Config:');
      expect(result).toContain('Plans path:');
      expect(result).toContain('Data path:');
      expect(result).toContain('Docs path:');

      // Check config was created in OS location (mocked to testDir)
      const expectedConfigPath = join(testDir, 'dir-proj', 'config.json');
      expect(existsSync(expectedConfigPath)).toBe(true);

      // Check registry was updated with OS config path
      const registry = loadRegistry();
      expect(registry.projects['dir-proj']).toBeDefined();
      expect(registry.projects['dir-proj'].configPath).toBe(expectedConfigPath);

      // Check config content points to the user's directory
      const config = JSON.parse(readFileSync(expectedConfigPath, 'utf-8'));
      expect(config.plansPath).toBe(join(projectDir, 'plans'));
      expect(config.docsPaths).toEqual([projectDir]);
      expect(config.dataPath).toBe(join(testDir, 'dir-proj', 'data'));
    });

    it('uses directory as plansPath when no plans subdirectory exists', () => {
      const projectDir = join(configDir, 'flat-dir');
      mkdirSync(projectDir, { recursive: true });
      // No plans subdirectory

      const result = configAdd('flat-proj', projectDir);

      expect(result).toContain('Created config and registered project "flat-proj"');

      // Check config content - plansPath should be the directory itself
      const expectedConfigPath = join(testDir, 'flat-proj', 'config.json');
      const config = JSON.parse(readFileSync(expectedConfigPath, 'utf-8'));
      expect(config.plansPath).toBe(projectDir); // Uses the directory directly
      expect(config.docsPaths).toEqual([projectDir]);
    });

    it('uses existing config.json when given a directory with config', () => {
      const projectDir = join(configDir, 'dir-with-config');
      mkdirSync(projectDir, { recursive: true });

      // Create a config file in the directory
      const existingConfig = join(projectDir, 'config.json');
      writeFileSync(
        existingConfig,
        JSON.stringify({
          configVersion: 1,
          plansPath: './my-plans',
          dataPath: './my-data',
          scoring: { weights: { dependency: 40, priority: 30, workload: 30 }, biases: {} },
        })
      );

      const result = configAdd('dir-existing', projectDir);

      expect(result).toContain('Registered project "dir-existing" with config:');
      expect(result).toContain(existingConfig);

      const registry = loadRegistry();
      expect(registry.projects['dir-existing']).toBeDefined();
      expect(registry.projects['dir-existing'].configPath).toBe(existingConfig);
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
        scoring: {
          weights: {
            dependency: 40,
            priority: 30,
            workload: 30,
          },
          biases: {},
        },
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
        scoring: {
          weights: {
            dependency: 40,
            priority: 30,
            workload: 30,
          },
          biases: {},
        },
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
        scoring: {
          weights: {
            dependency: 40,
            priority: 30,
            workload: 30,
          },
          biases: {},
        },
      };
      writeFileSync(configFilePath, JSON.stringify(config, null, 2));
      registerProject('already-registered', configFilePath);

      const output = configDiscover();

      expect(output).toContain('No new projects discovered');
    });
  });

  describe('configAddClaude', () => {
    let claudeConfigDir: string;
    let claudeConfigPath: string;

    beforeEach(() => {
      // Mock homedir to use test directory
      mockHomedirValue = testDir;
      claudeConfigDir = join(testDir, 'Library', 'Application Support', 'Claude');
      claudeConfigPath = join(claudeConfigDir, 'claude_desktop_config.json');
      mkdirSync(claudeConfigDir, { recursive: true });
    });

    afterEach(() => {
      mockHomedirValue = null;
    });

    it('adds all registered projects to Claude Desktop config', () => {
      const configA = createConfig('project-a');
      const configB = createConfig('project-b');
      registerProject('project-a', configA);
      registerProject('project-b', configB);

      const output = configAddClaude(() => configA);

      expect(output).toContain('Added');
      expect(output).toContain('claude_desktop_config.json');

      const claudeConfig = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'));
      expect(claudeConfig.mcpServers).toBeDefined();
      expect(claudeConfig.mcpServers['limps-planning-project-a']).toBeDefined();
      expect(claudeConfig.mcpServers['limps-planning-project-b']).toBeDefined();
      expect(claudeConfig.mcpServers['limps-planning-project-a'].command).toBe('npx');
      expect(claudeConfig.mcpServers['limps-planning-project-a'].args).toEqual([
        '-y',
        '@sudosandwich/limps',
        'serve',
        '--config',
        configA,
      ]);
      expect(claudeConfig.mcpServers['limps-planning-project-b'].args).toEqual([
        '-y',
        '@sudosandwich/limps',
        'serve',
        '--config',
        configB,
      ]);
    });

    it('creates Claude Desktop config if it does not exist', () => {
      const configPath = createConfig('new-project');
      registerProject('new-project', configPath);

      configAddClaude(() => configPath);

      expect(existsSync(claudeConfigPath)).toBe(true);
      const claudeConfig = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'));
      expect(claudeConfig.mcpServers).toBeDefined();
      expect(claudeConfig.mcpServers['limps-planning-new-project']).toBeDefined();
    });

    it('preserves existing MCP servers in Claude Desktop config', () => {
      const existingConfig = {
        mcpServers: {
          'other-server': {
            command: 'other-command',
            args: ['arg1'],
          },
        },
      };
      writeFileSync(claudeConfigPath, JSON.stringify(existingConfig, null, 2));

      const configPath = createConfig('my-project');
      registerProject('my-project', configPath);

      configAddClaude(() => configPath);

      const claudeConfig = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'));
      expect(claudeConfig.mcpServers['other-server']).toBeDefined();
      expect(claudeConfig.mcpServers['limps-planning-my-project']).toBeDefined();
    });

    it('filters projects when project list is provided', () => {
      const configA = createConfig('project-a');
      const configB = createConfig('project-b');
      const configC = createConfig('project-c');
      registerProject('project-a', configA);
      registerProject('project-b', configB);
      registerProject('project-c', configC);

      configAddClaude(() => configA, ['project-a', 'project-c']);

      const claudeConfig = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'));
      expect(claudeConfig.mcpServers['limps-planning-project-a']).toBeDefined();
      expect(claudeConfig.mcpServers['limps-planning-project-b']).toBeUndefined();
      expect(claudeConfig.mcpServers['limps-planning-project-c']).toBeDefined();
    });

    it('skips projects with missing config files', () => {
      const configA = createConfig('project-a');
      registerProject('project-a', configA);
      registerProject('missing-project', '/nonexistent/config.json');

      const output = configAddClaude(() => configA);

      const claudeConfig = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'));
      expect(claudeConfig.mcpServers['limps-planning-project-a']).toBeDefined();
      expect(claudeConfig.mcpServers['limps-planning-missing-project']).toBeUndefined();
      expect(output).toContain('project-a');
    });

    it('returns message listing all added servers', () => {
      const configA = createConfig('project-a');
      const configB = createConfig('project-b');
      registerProject('project-a', configA);
      registerProject('project-b', configB);

      const output = configAddClaude(() => configA);

      expect(output).toContain('limps-planning-project-a');
      expect(output).toContain('limps-planning-project-b');
      expect(output).toContain('Restart Claude Desktop');
    });

    it('throws error when no projects are registered', () => {
      expect(() => configAddClaude(() => '/nonexistent/config.json')).toThrow(
        'Limps config not found'
      );
    });

    it('throws error when registry is empty', () => {
      // Clear registry by removing all projects
      const registry = loadRegistry();
      const projectNames = Object.keys(registry.projects);
      for (const name of projectNames) {
        unregisterProject(name);
      }

      const configPath = createConfig('test');
      expect(() => configAddClaude(() => configPath)).toThrow('No projects registered');
    });

    it('overwrites existing limps server entries', () => {
      const existingConfig = {
        mcpServers: {
          'limps-planning-project-a': {
            command: 'old-command',
            args: ['old-args'],
          },
        },
      };
      writeFileSync(claudeConfigPath, JSON.stringify(existingConfig, null, 2));

      const configA = createConfig('project-a');
      registerProject('project-a', configA);

      configAddClaude(() => configA);

      const claudeConfig = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'));
      expect(claudeConfig.mcpServers['limps-planning-project-a'].command).toBe('npx');
      expect(claudeConfig.mcpServers['limps-planning-project-a'].args).toContain('serve');
    });

    it('throws when Claude mcpServers is not an object', () => {
      const existingConfig = {
        mcpServers: 'invalid',
      };
      writeFileSync(claudeConfigPath, JSON.stringify(existingConfig, null, 2));

      const configPath = createConfig('my-project');
      registerProject('my-project', configPath);

      expect(() => configAddClaude(() => configPath)).toThrow('mcpServers');
    });

    it('throws error when all projects have missing config files', () => {
      // Create a valid config to pass the initial validation
      const validConfig = createConfig('temp-valid');
      registerProject('missing-1', '/nonexistent/config1.json');
      registerProject('missing-2', '/nonexistent/config2.json');

      // Filter to only the missing projects
      expect(() => configAddClaude(() => validConfig, ['missing-1', 'missing-2'])).toThrow(
        'missing-1'
      );
      expect(() => configAddClaude(() => validConfig, ['missing-1', 'missing-2'])).toThrow(
        'missing-2'
      );
    });

    it('throws error when filtered projects do not exist', () => {
      const configA = createConfig('project-a');
      registerProject('project-a', configA);

      expect(() => configAddClaude(() => configA, ['nonexistent-project'])).toThrow(
        'No matching projects found'
      );
    });
  });

  describe('configAddCursor', () => {
    let cursorConfigDir: string;
    let cursorConfigPath: string;
    let originalXdgConfigHome: string | undefined;

    beforeEach(() => {
      // Mock homedir to use test directory
      mockHomedirValue = testDir;
      // Clear XDG_CONFIG_HOME to ensure consistent behavior across CI environments
      originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
      delete process.env.XDG_CONFIG_HOME;
      // Cursor uses VS Code settings.json location
      if (process.platform === 'darwin') {
        cursorConfigDir = join(testDir, 'Library', 'Application Support', 'Cursor', 'User');
      } else if (process.platform === 'win32') {
        cursorConfigDir = join(testDir, 'AppData', 'Roaming', 'Cursor', 'User');
      } else {
        cursorConfigDir = join(testDir, '.config', 'Cursor', 'User');
      }
      cursorConfigPath = join(cursorConfigDir, 'settings.json');
      mkdirSync(cursorConfigDir, { recursive: true });
    });

    afterEach(() => {
      mockHomedirValue = null;
      // Restore XDG_CONFIG_HOME
      if (originalXdgConfigHome !== undefined) {
        process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
      }
    });

    it('adds all registered projects to Cursor config', () => {
      const configA = createConfig('project-a');
      const configB = createConfig('project-b');
      registerProject('project-a', configA);
      registerProject('project-b', configB);

      const output = configAddCursor(() => configA);

      expect(output).toContain('Added');
      expect(output).toContain('settings.json');

      const cursorConfig = JSON.parse(readFileSync(cursorConfigPath, 'utf-8'));
      expect(cursorConfig['mcp.servers']).toBeDefined();
      expect(cursorConfig['mcp.servers']['limps-planning-project-a']).toBeDefined();
      expect(cursorConfig['mcp.servers']['limps-planning-project-b']).toBeDefined();
      expect(cursorConfig['mcp.servers']['limps-planning-project-a'].command).toBe('limps');
      expect(cursorConfig['mcp.servers']['limps-planning-project-a'].args).toEqual([
        'serve',
        '--config',
        configA,
      ]);
    });

    it('creates Cursor config if it does not exist', () => {
      const configPath = createConfig('new-project');
      registerProject('new-project', configPath);

      configAddCursor(() => configPath);

      expect(existsSync(cursorConfigPath)).toBe(true);
      const cursorConfig = JSON.parse(readFileSync(cursorConfigPath, 'utf-8'));
      expect(cursorConfig['mcp.servers']).toBeDefined();
      expect(cursorConfig['mcp.servers']['limps-planning-new-project']).toBeDefined();
    });

    it('preserves existing settings in Cursor config', () => {
      const existingConfig = {
        'editor.formatOnSave': true,
        'mcp.servers': {
          'other-server': {
            command: 'other-command',
            args: ['arg1'],
          },
        },
      };
      writeFileSync(cursorConfigPath, JSON.stringify(existingConfig, null, 2));

      const configPath = createConfig('my-project');
      registerProject('my-project', configPath);

      configAddCursor(() => configPath);

      const cursorConfig = JSON.parse(readFileSync(cursorConfigPath, 'utf-8'));
      expect(cursorConfig['editor.formatOnSave']).toBe(true);
      expect(cursorConfig['mcp.servers']['other-server']).toBeDefined();
      expect(cursorConfig['mcp.servers']['limps-planning-my-project']).toBeDefined();
    });

    it('throws when Cursor mcp.servers is not an object', () => {
      const existingConfig = {
        'mcp.servers': 'invalid',
      };
      writeFileSync(cursorConfigPath, JSON.stringify(existingConfig, null, 2));

      const configPath = createConfig('my-project');
      registerProject('my-project', configPath);

      expect(() => configAddCursor(() => configPath)).toThrow('mcp.servers');
    });
  });

  describe('configAddCodex', () => {
    let codexConfigDir: string;
    let codexConfigPath: string;

    beforeEach(() => {
      mockHomedirValue = testDir;
      codexConfigDir = join(testDir, '.codex');
      codexConfigPath = join(codexConfigDir, 'config.toml');
      mkdirSync(codexConfigDir, { recursive: true });
    });

    afterEach(() => {
      mockHomedirValue = null;
    });

    it('adds limps servers to Codex TOML config', () => {
      const configA = createConfig('project-a');
      const configB = createConfig('project-b');
      registerProject('project-a', configA);
      registerProject('project-b', configB);

      const output = configAddCodex(() => configA);

      expect(output).toContain('OpenAI Codex');
      expect(output).toContain('config.toml');

      const parsed = toml.parse(readFileSync(codexConfigPath, 'utf-8')) as Record<string, unknown>;
      const servers = parsed.mcp_servers as Record<string, unknown>;
      expect(servers).toBeDefined();
      expect(servers['limps-planning-project-a']).toBeDefined();
      expect(servers['limps-planning-project-b']).toBeDefined();
      expect((servers['limps-planning-project-a'] as Record<string, unknown>).command).toBe(
        'limps'
      );
      expect((servers['limps-planning-project-a'] as Record<string, unknown>).args).toEqual([
        'serve',
        '--config',
        configA,
      ]);
    });

    it('preserves existing Codex TOML settings', () => {
      const existingToml = toml.stringify({
        theme: 'dark',
        mcp_servers: {
          'other-server': {
            command: 'other',
            args: ['--flag'],
          },
        },
      });
      writeFileSync(codexConfigPath, existingToml, 'utf-8');

      const configPath = createConfig('my-project');
      registerProject('my-project', configPath);

      configAddCodex(() => configPath);

      const parsed = toml.parse(readFileSync(codexConfigPath, 'utf-8')) as Record<string, unknown>;
      expect(parsed.theme).toBe('dark');
      const servers = parsed.mcp_servers as Record<string, unknown>;
      expect(servers['other-server']).toBeDefined();
      expect(servers['limps-planning-my-project']).toBeDefined();
    });

    it('throws when Codex mcp_servers is not an object', () => {
      const existingToml = toml.stringify({
        mcp_servers: 'invalid',
      });
      writeFileSync(codexConfigPath, existingToml, 'utf-8');

      const configPath = createConfig('my-project');
      registerProject('my-project', configPath);

      expect(() => configAddCodex(() => configPath)).toThrow('mcp_servers');
    });
  });

  describe('configAddLocalMcp', () => {
    let localMcpPath: string;
    let originalCwd: string;

    beforeEach(() => {
      // Save original cwd
      originalCwd = process.cwd();
      // Change to test directory
      process.chdir(testDir);
      localMcpPath = join(testDir, '.mcp.json');
    });

    afterEach(() => {
      // Restore original cwd
      process.chdir(originalCwd);
    });

    it('creates local .mcp.json if it does not exist', () => {
      const configPath = createConfig('new-project');
      registerProject('new-project', configPath);

      const output = configAddLocalMcp(() => configPath);

      expect(output).toContain('.mcp.json');
      expect(output).toContain('Added');
      expect(existsSync(localMcpPath)).toBe(true);
      const localConfig = JSON.parse(readFileSync(localMcpPath, 'utf-8'));
      expect(localConfig.mcpServers).toBeDefined();
      expect(localConfig.mcpServers['limps-planning-new-project']).toBeDefined();
    });

    it('adds all registered projects to local .mcp.json', () => {
      const configA = createConfig('project-a');
      const configB = createConfig('project-b');
      registerProject('project-a', configA);
      registerProject('project-b', configB);

      const output = configAddLocalMcp(() => configA);

      expect(output).toContain('Added');
      expect(output).toContain('.mcp.json');

      const localConfig = JSON.parse(readFileSync(localMcpPath, 'utf-8'));
      expect(localConfig.mcpServers).toBeDefined();
      expect(localConfig.mcpServers['limps-planning-project-a']).toBeDefined();
      expect(localConfig.mcpServers['limps-planning-project-b']).toBeDefined();
      expect(localConfig.mcpServers['limps-planning-project-a'].command).toBe('limps');
      expect(localConfig.mcpServers['limps-planning-project-a'].args).toEqual([
        'serve',
        '--config',
        configA,
      ]);
    });

    it('preserves existing settings in local .mcp.json', () => {
      const existingConfig = {
        mcpServers: {
          'other-server': {
            command: 'other-command',
            args: ['arg1'],
          },
        },
      };
      writeFileSync(localMcpPath, JSON.stringify(existingConfig, null, 2));

      const configPath = createConfig('my-project');
      registerProject('my-project', configPath);

      configAddLocalMcp(() => configPath);

      const localConfig = JSON.parse(readFileSync(localMcpPath, 'utf-8'));
      expect(localConfig.mcpServers['other-server']).toBeDefined();
      expect(localConfig.mcpServers['limps-planning-my-project']).toBeDefined();
    });

    it('detects local .mcp.json existence', () => {
      // Initially should not exist
      expect(hasLocalMcpJson()).toBe(false);

      // Create the file
      writeFileSync(localMcpPath, JSON.stringify({ mcpServers: {} }, null, 2));

      // Now should exist
      expect(hasLocalMcpJson()).toBe(true);
    });

    it('handles custom path for .mcp.json', () => {
      const customPath = join(testDir, 'custom', '.mcp.json');
      mkdirSync(dirname(customPath), { recursive: true });

      const configPath = createConfig('custom-project');
      registerProject('custom-project', configPath);

      const output = configAddLocalMcp(() => configPath, undefined, customPath);

      expect(output).toContain('Added');
      expect(output).toContain(customPath);
      expect(existsSync(customPath)).toBe(true);
      const localConfig = JSON.parse(readFileSync(customPath, 'utf-8'));
      expect(localConfig.mcpServers['limps-planning-custom-project']).toBeDefined();
    });
  });

  describe('generateChatGptInstructions', () => {
    it('outputs ChatGPT connector instructions with project names', () => {
      const configA = createConfig('project-a');
      const configB = createConfig('project-b');
      registerProject('project-a', configA);
      registerProject('project-b', configB);

      const output = generateChatGptInstructions(() => configA);

      expect(output).toContain('ChatGPT');
      expect(output).toContain('project-a');
      expect(output).toContain('project-b');
      expect(output).toContain('Server URL');
      expect(output).toContain('Authentication');
    });
  });

  describe('generateConfigForPrint', () => {
    it('generates config JSON for Claude Desktop', () => {
      const configA = createConfig('project-a');
      const configB = createConfig('project-b');
      registerProject('project-a', configA);
      registerProject('project-b', configB);

      const adapter = getAdapter('claude');
      const output = generateConfigForPrint(adapter, () => configA);

      expect(output).toContain('Claude Desktop Configuration');
      expect(output).toContain('mcpServers');
      expect(output).toContain('limps-planning-project-a');
      expect(output).toContain('limps-planning-project-b');
      expect(output).toContain('npx');
      expect(output).toContain('@sudosandwich/limps');
      // Should contain valid JSON
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      expect(jsonMatch).toBeTruthy();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        expect(parsed.mcpServers).toBeDefined();
      }
    });

    it('generates config JSON for Cursor', () => {
      const configA = createConfig('project-a');
      registerProject('project-a', configA);

      const adapter = getAdapter('cursor');
      const output = generateConfigForPrint(adapter, () => configA);

      expect(output).toContain('Cursor Configuration');
      expect(output).toContain('mcp.servers');
      expect(output).toContain('limps-planning-project-a');
      expect(output).toContain('limps');
      // Should contain valid JSON
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      expect(jsonMatch).toBeTruthy();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        expect(parsed['mcp.servers']).toBeDefined();
      }
    });

    it('generates config TOML for OpenAI Codex', () => {
      const configA = createConfig('project-a');
      registerProject('project-a', configA);

      const adapter = getAdapter('codex');
      const output = generateConfigForPrint(adapter, () => configA);

      expect(output).toContain('OpenAI Codex Configuration');
      expect(output).toContain('mcp_servers');
      expect(output).toContain('limps-planning-project-a');
      const marker = '\nAdd this to your OpenAI Codex config file:\n';
      const startIndex = output.indexOf(marker);
      expect(startIndex).toBeGreaterThanOrEqual(0);
      const afterMarker = output.slice(startIndex + marker.length);
      const tomlText = afterMarker.split('\nConfig file location:')[0].trim();
      const parsed = toml.parse(tomlText) as Record<string, unknown>;
      const servers = parsed.mcp_servers as Record<string, unknown>;
      expect(servers['limps-planning-project-a']).toBeDefined();
    });

    it('filters projects when project list is provided', () => {
      const configA = createConfig('project-a');
      const configB = createConfig('project-b');
      registerProject('project-a', configA);
      registerProject('project-b', configB);

      const adapter = getAdapter('claude');
      const output = generateConfigForPrint(adapter, () => configA, ['project-a']);

      expect(output).toContain('limps-planning-project-a');
      expect(output).not.toContain('limps-planning-project-b');
    });
  });

  describe('configUpdate', () => {
    it('updates plansPath in project config', () => {
      const configPath = createConfig('update-test');
      registerProject('update-test', configPath);

      const output = configUpdate('update-test', {
        plansPath: '~/new/plans/path',
      });

      expect(output).toContain('Updated project "update-test"');
      expect(output).toContain('plansPath');
      expect(output).toContain('~/new/plans/path');

      const updatedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(updatedConfig.plansPath).toBe('~/new/plans/path');
    });

    it('updates docsPaths in project config', () => {
      const configPath = createConfig('docs-test');
      registerProject('docs-test', configPath);

      const output = configUpdate('docs-test', {
        docsPath: '~/new/docs/path',
      });

      expect(output).toContain('Updated project "docs-test"');
      expect(output).toContain('docsPaths');
      expect(output).toContain('~/new/docs/path');

      const updatedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(updatedConfig.docsPaths).toEqual(['~/new/docs/path']);
    });

    it('updates both plansPath and docsPath together', () => {
      const configPath = createConfig('both-test');
      registerProject('both-test', configPath);

      const output = configUpdate('both-test', {
        plansPath: '~/new/plans',
        docsPath: '~/new/docs',
      });

      expect(output).toContain('plansPath');
      expect(output).toContain('docsPaths');

      const updatedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(updatedConfig.plansPath).toBe('~/new/plans');
      expect(updatedConfig.docsPaths).toEqual(['~/new/docs']);
    });

    it('preserves other config fields when updating', () => {
      const configPath = createConfig('preserve-test');
      // Add extra fields to the config
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      config.fileExtensions = ['.md', '.txt'];
      config.customField = 'should-stay';
      writeFileSync(configPath, JSON.stringify(config, null, 2));
      registerProject('preserve-test', configPath);

      configUpdate('preserve-test', { plansPath: '~/updated/plans' });

      const updatedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(updatedConfig.plansPath).toBe('~/updated/plans');
      expect(updatedConfig.fileExtensions).toEqual(['.md', '.txt']);
      expect(updatedConfig.customField).toBe('should-stay');
    });

    it('returns message when no changes specified', () => {
      const configPath = createConfig('no-change');
      registerProject('no-change', configPath);

      const output = configUpdate('no-change', {});

      expect(output).toContain('No changes specified');
      expect(output).toContain('--plans-path');
      expect(output).toContain('--docs-path');
    });

    it('throws error for unknown project', () => {
      expect(() => configUpdate('nonexistent', { plansPath: '/some/path' })).toThrow(
        'Project "nonexistent" not found'
      );
    });

    it('lists available projects in error message', () => {
      const configPath = createConfig('exists');
      registerProject('exists', configPath);

      try {
        configUpdate('nonexistent', { plansPath: '/some/path' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('exists');
      }
    });

    it('throws error when config file does not exist', () => {
      registerProject('missing-config', '/nonexistent/config.json');

      expect(() => configUpdate('missing-config', { plansPath: '/some/path' })).toThrow(
        'Config file not found'
      );
    });
  });
});
