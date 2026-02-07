import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import type * as osModule from 'os';

// Track the mock homedir value (needed for configAdd* tests that locate client config dirs)
let mockHomedirValue: string | null = null;

vi.mock('os', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof osModule;
  return {
    ...actual,
    homedir: (): string => mockHomedirValue ?? actual.homedir(),
  };
});

import * as toml from '@iarna/toml';
import {
  configShow,
  configPath,
  configUpgrade,
  configAddClaude,
  configAddCursor,
  configAddCodex,
  configAddLocalMcp,
  generateChatGptInstructions,
  generateConfigForPrint,
  configUpdate,
} from '../../src/cli/config-cmd.js';
import { getAdapter, LocalMcpAdapter } from '../../src/cli/mcp-client-adapter.js';

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // Helper to create a valid config file inside a named project directory
  // so that basename(dirname(configPath)) gives a meaningful server name
  function createConfig(name: string): string {
    const projectDir = join(configDir, name);
    mkdirSync(projectDir, { recursive: true });
    const cfgPath = join(projectDir, 'config.json');
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
    writeFileSync(cfgPath, JSON.stringify(config, null, 2));
    return cfgPath;
  }

  describe('configShow', () => {
    it('shows configuration for resolved config path', () => {
      const cfgPath = createConfig('test-project');

      const output = configShow(() => cfgPath);

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
      const cfgPath = join(configDir, 'scoring-project');
      mkdirSync(cfgPath, { recursive: true });
      const scoringConfigPath = join(cfgPath, 'config.json');
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
      writeFileSync(scoringConfigPath, JSON.stringify(config, null, 2));

      const output = configShow(() => scoringConfigPath);

      expect(output).toContain('scoring:');
      expect(output).toContain('weights:');
      expect(output).toContain('dependency:');
      expect(output).toContain('50');
      expect(output).toContain('priority:');
      expect(output).toContain('25');
      expect(output).toContain('workload:');
    });

    it('shows scoring biases when present', () => {
      const cfgDir = join(configDir, 'biases-project');
      mkdirSync(cfgDir, { recursive: true });
      const cfgPath = join(cfgDir, 'config.json');
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
      writeFileSync(cfgPath, JSON.stringify(config, null, 2));

      const output = configShow(() => cfgPath);

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
      const cfgDir = join(configDir, 'full-scoring-project');
      mkdirSync(cfgDir, { recursive: true });
      const cfgPath = join(cfgDir, 'config.json');
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
      writeFileSync(cfgPath, JSON.stringify(config, null, 2));

      const output = configShow(() => cfgPath);

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

  describe('configUpgrade', () => {
    it('upgrades a single resolved config path', () => {
      const cfgDir = join(configDir, 'upgrade-project');
      mkdirSync(cfgDir, { recursive: true });
      const cfgPath = join(cfgDir, 'config.json');
      writeFileSync(cfgPath, JSON.stringify({ plansPath: './plans', dataPath: './data' }, null, 2));

      const output = configUpgrade(() => cfgPath);

      expect(output).toContain('Config upgraded to version');
      expect(output).toContain(cfgPath);
    });
  });

  describe('configAddClaude', () => {
    let claudeConfigDir: string;
    let claudeConfigPath: string;

    beforeEach(() => {
      mockHomedirValue = testDir;
      claudeConfigDir = join(testDir, 'Library', 'Application Support', 'Claude');
      claudeConfigPath = join(claudeConfigDir, 'claude_desktop_config.json');
      mkdirSync(claudeConfigDir, { recursive: true });
    });

    afterEach(() => {
      mockHomedirValue = null;
    });

    it('adds a single project to Claude Desktop config', () => {
      const cfgPath = createConfig('project-a');

      const output = configAddClaude(cfgPath);

      expect(output).toContain('Added');
      expect(output).toContain('claude_desktop_config.json');

      const claudeConfig = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'));
      expect(claudeConfig.mcpServers).toBeDefined();
      expect(claudeConfig.mcpServers['limps-planning-project-a']).toBeDefined();
      expect(claudeConfig.mcpServers['limps-planning-project-a'].command).toBe('npx');
      expect(claudeConfig.mcpServers['limps-planning-project-a'].args).toEqual([
        '-y',
        '@sudosandwich/limps',
        'serve',
        '--config',
        cfgPath,
      ]);
    });

    it('creates Claude Desktop config if it does not exist', () => {
      const cfgPath = createConfig('new-project');

      configAddClaude(cfgPath);

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

      const cfgPath = createConfig('my-project');

      configAddClaude(cfgPath);

      const claudeConfig = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'));
      expect(claudeConfig.mcpServers['other-server']).toBeDefined();
      expect(claudeConfig.mcpServers['limps-planning-my-project']).toBeDefined();
    });

    it('returns message listing added server', () => {
      const cfgPath = createConfig('project-a');

      const output = configAddClaude(cfgPath);

      expect(output).toContain('limps-planning-project-a');
      expect(output).toContain('Restart Claude Desktop');
    });

    it('throws error when config file does not exist', () => {
      expect(() => configAddClaude('/nonexistent/config.json')).toThrow('Limps config not found');
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

      const cfgPath = createConfig('project-a');

      configAddClaude(cfgPath);

      const claudeConfig = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'));
      expect(claudeConfig.mcpServers['limps-planning-project-a'].command).toBe('npx');
      expect(claudeConfig.mcpServers['limps-planning-project-a'].args).toContain('serve');
    });

    it('throws when Claude mcpServers is not an object', () => {
      const existingConfig = {
        mcpServers: 'invalid',
      };
      writeFileSync(claudeConfigPath, JSON.stringify(existingConfig, null, 2));

      const cfgPath = createConfig('my-project');

      expect(() => configAddClaude(cfgPath)).toThrow('mcpServers');
    });
  });

  describe('configAddCursor', () => {
    let cursorConfigDir: string;
    let cursorConfigPath: string;
    let originalXdgConfigHome: string | undefined;

    beforeEach(() => {
      mockHomedirValue = testDir;
      originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
      delete process.env.XDG_CONFIG_HOME;
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
      if (originalXdgConfigHome !== undefined) {
        process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
      }
    });

    it('adds a single project to Cursor config', () => {
      const cfgPath = createConfig('project-a');

      const output = configAddCursor(cfgPath);

      expect(output).toContain('Added');
      expect(output).toContain('settings.json');

      const cursorConfig = JSON.parse(readFileSync(cursorConfigPath, 'utf-8'));
      expect(cursorConfig['mcp.servers']).toBeDefined();
      expect(cursorConfig['mcp.servers']['limps-planning-project-a']).toBeDefined();
      expect(cursorConfig['mcp.servers']['limps-planning-project-a'].command).toBe('limps');
      expect(cursorConfig['mcp.servers']['limps-planning-project-a'].args).toEqual([
        'serve',
        '--config',
        cfgPath,
      ]);
    });

    it('creates Cursor config if it does not exist', () => {
      const cfgPath = createConfig('new-project');

      configAddCursor(cfgPath);

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

      const cfgPath = createConfig('my-project');

      configAddCursor(cfgPath);

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

      const cfgPath = createConfig('my-project');

      expect(() => configAddCursor(cfgPath)).toThrow('mcp.servers');
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

    it('adds limps server to Codex TOML config', () => {
      const cfgPath = createConfig('project-a');

      const output = configAddCodex(cfgPath);

      expect(output).toContain('OpenAI Codex');
      expect(output).toContain('config.toml');

      const parsed = toml.parse(readFileSync(codexConfigPath, 'utf-8')) as Record<string, unknown>;
      const servers = parsed.mcp_servers as Record<string, unknown>;
      expect(servers).toBeDefined();
      expect(servers['limps-planning-project-a']).toBeDefined();
      expect((servers['limps-planning-project-a'] as Record<string, unknown>).command).toBe(
        'limps'
      );
      expect((servers['limps-planning-project-a'] as Record<string, unknown>).args).toEqual([
        'serve',
        '--config',
        cfgPath,
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

      const cfgPath = createConfig('my-project');

      configAddCodex(cfgPath);

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

      const cfgPath = createConfig('my-project');

      expect(() => configAddCodex(cfgPath)).toThrow('mcp_servers');
    });
  });

  describe('configAddLocalMcp', () => {
    let localMcpPath: string;
    let originalCwd: string;

    beforeEach(() => {
      originalCwd = process.cwd();
      process.chdir(testDir);
      localMcpPath = join(testDir, '.mcp.json');
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    it('creates local .mcp.json if it does not exist', () => {
      const cfgPath = createConfig('new-project');

      const output = configAddLocalMcp(cfgPath);

      expect(output).toContain('.mcp.json');
      expect(output).toContain('Added');
      expect(existsSync(localMcpPath)).toBe(true);
      const localConfig = JSON.parse(readFileSync(localMcpPath, 'utf-8'));
      expect(localConfig.mcpServers).toBeDefined();
      expect(localConfig.mcpServers['limps-planning-new-project']).toBeDefined();
    });

    it('adds a single project to local .mcp.json', () => {
      const cfgPath = createConfig('project-a');

      const output = configAddLocalMcp(cfgPath);

      expect(output).toContain('Added');
      expect(output).toContain('.mcp.json');

      const localConfig = JSON.parse(readFileSync(localMcpPath, 'utf-8'));
      expect(localConfig.mcpServers).toBeDefined();
      expect(localConfig.mcpServers['limps-planning-project-a']).toBeDefined();
      expect(localConfig.mcpServers['limps-planning-project-a'].command).toBe('limps');
      expect(localConfig.mcpServers['limps-planning-project-a'].args).toEqual([
        'serve',
        '--config',
        cfgPath,
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

      const cfgPath = createConfig('my-project');

      configAddLocalMcp(cfgPath);

      const localConfig = JSON.parse(readFileSync(localMcpPath, 'utf-8'));
      expect(localConfig.mcpServers['other-server']).toBeDefined();
      expect(localConfig.mcpServers['limps-planning-my-project']).toBeDefined();
    });

    it('handles custom path for .mcp.json', () => {
      const customPath = join(testDir, 'custom', '.mcp.json');
      mkdirSync(dirname(customPath), { recursive: true });

      const cfgPath = createConfig('custom-project');
      const adapter = new LocalMcpAdapter('custom', customPath);

      const output = configAddLocalMcp(cfgPath, adapter);

      expect(output).toContain('Added');
      expect(output).toContain(customPath);
      expect(existsSync(customPath)).toBe(true);
      const localConfig = JSON.parse(readFileSync(customPath, 'utf-8'));
      expect(localConfig.mcpServers['limps-planning-custom-project']).toBeDefined();
    });
  });

  describe('generateChatGptInstructions', () => {
    it('outputs ChatGPT connector instructions for a single project', () => {
      const cfgPath = createConfig('project-a');

      const output = generateChatGptInstructions(cfgPath);

      expect(output).toContain('ChatGPT');
      expect(output).toContain('limps-planning-project-a');
      expect(output).toContain('Server URL');
      expect(output).toContain('Authentication');
    });

    it('throws error when config file does not exist', () => {
      expect(() => generateChatGptInstructions('/nonexistent/config.json')).toThrow(
        'Limps config not found'
      );
    });
  });

  describe('generateConfigForPrint', () => {
    it('generates config JSON for Claude Desktop', () => {
      const cfgPath = createConfig('project-a');

      const adapter = getAdapter('claude');
      const output = generateConfigForPrint(adapter, cfgPath);

      expect(output).toContain('Claude Desktop Configuration');
      expect(output).toContain('mcpServers');
      expect(output).toContain('limps-planning-project-a');
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
      const cfgPath = createConfig('project-a');

      const adapter = getAdapter('cursor');
      const output = generateConfigForPrint(adapter, cfgPath);

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
      const cfgPath = createConfig('project-a');

      const adapter = getAdapter('codex');
      const output = generateConfigForPrint(adapter, cfgPath);

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
  });

  describe('configUpdate', () => {
    it('updates plansPath in project config', () => {
      const cfgPath = createConfig('update-test');

      const output = configUpdate(cfgPath, {
        plansPath: '~/new/plans/path',
      });

      expect(output).toContain('Updated configuration');
      expect(output).toContain('plansPath');
      expect(output).toContain('~/new/plans/path');

      const updatedConfig = JSON.parse(readFileSync(cfgPath, 'utf-8'));
      expect(updatedConfig.plansPath).toBe('~/new/plans/path');
    });

    it('updates docsPaths in project config', () => {
      const cfgPath = createConfig('docs-test');

      const output = configUpdate(cfgPath, {
        docsPath: '~/new/docs/path',
      });

      expect(output).toContain('Updated configuration');
      expect(output).toContain('docsPaths');
      expect(output).toContain('~/new/docs/path');

      const updatedConfig = JSON.parse(readFileSync(cfgPath, 'utf-8'));
      expect(updatedConfig.docsPaths).toEqual(['~/new/docs/path']);
    });

    it('updates both plansPath and docsPath together', () => {
      const cfgPath = createConfig('both-test');

      const output = configUpdate(cfgPath, {
        plansPath: '~/new/plans',
        docsPath: '~/new/docs',
      });

      expect(output).toContain('plansPath');
      expect(output).toContain('docsPaths');

      const updatedConfig = JSON.parse(readFileSync(cfgPath, 'utf-8'));
      expect(updatedConfig.plansPath).toBe('~/new/plans');
      expect(updatedConfig.docsPaths).toEqual(['~/new/docs']);
    });

    it('preserves other config fields when updating', () => {
      const cfgPath = createConfig('preserve-test');
      const config = JSON.parse(readFileSync(cfgPath, 'utf-8'));
      config.fileExtensions = ['.md', '.txt'];
      config.customField = 'should-stay';
      writeFileSync(cfgPath, JSON.stringify(config, null, 2));

      configUpdate(cfgPath, { plansPath: '~/updated/plans' });

      const updatedConfig = JSON.parse(readFileSync(cfgPath, 'utf-8'));
      expect(updatedConfig.plansPath).toBe('~/updated/plans');
      expect(updatedConfig.fileExtensions).toEqual(['.md', '.txt']);
      expect(updatedConfig.customField).toBe('should-stay');
    });

    it('returns message when no changes specified', () => {
      const cfgPath = createConfig('no-change');

      const output = configUpdate(cfgPath, {});

      expect(output).toContain('No changes specified');
      expect(output).toContain('--plans-path');
      expect(output).toContain('--docs-path');
    });

    it('throws error when config file does not exist', () => {
      expect(() => configUpdate('/nonexistent/config.json', { plansPath: '/some/path' })).toThrow(
        'Config file not found'
      );
    });
  });
});
