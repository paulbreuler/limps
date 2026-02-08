import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import * as toml from '@iarna/toml';
import {
  configShow,
  configPath,
  configUpgrade,
  generateChatGptInstructions,
  generateConfigForPrint,
  generateMcpClientConfig,
  configUpdate,
} from '../../src/cli/config-cmd.js';
import { getAdapter, getLocalAdapter } from '../../src/cli/mcp-client-adapter.js';

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
    it('generates HTTP transport config for Claude Desktop', () => {
      const cfgPath = createConfig('project-a');

      const adapter = getAdapter('claude');
      const output = generateConfigForPrint(adapter, cfgPath);

      expect(output).toContain('Claude Desktop Configuration');
      expect(output).toContain('mcpServers');
      expect(output).toContain('limps-planning-project-a');
      expect(output).toContain('transport');
      expect(output).toContain('http://127.0.0.1:4269/mcp');
      // Should contain valid JSON
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      expect(jsonMatch).toBeTruthy();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        expect(parsed.mcpServers).toBeDefined();
      }
    });

    it('generates HTTP transport config for Cursor', () => {
      const cfgPath = createConfig('project-a');

      const adapter = getAdapter('cursor');
      const output = generateConfigForPrint(adapter, cfgPath);

      expect(output).toContain('Cursor Configuration');
      expect(output).toContain('mcp.servers');
      expect(output).toContain('limps-planning-project-a');
      expect(output).toContain('transport');
      // Should contain valid JSON
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      expect(jsonMatch).toBeTruthy();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        expect(parsed['mcp.servers']).toBeDefined();
      }
    });

    it('generates HTTP transport config (TOML) for OpenAI Codex', () => {
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

  describe('HTTP Transport Configuration', () => {
    describe('generateMcpClientConfig', () => {
      it('generates HTTP transport config for Claude Desktop', () => {
        const cfgPath = createConfig('http-claude');
        const adapter = getAdapter('claude');

        const { servers } = generateMcpClientConfig(adapter, cfgPath);
        const serverConfig = Object.values(servers)[0];

        expect(serverConfig).toHaveProperty('transport');
        expect(serverConfig).toHaveProperty('transport.type', 'http');
        expect(serverConfig).toHaveProperty('transport.url', 'http://127.0.0.1:4269/mcp');
      });

      it('generates HTTP transport config for Cursor', () => {
        const cfgPath = createConfig('http-cursor');
        const adapter = getAdapter('cursor');

        const { servers } = generateMcpClientConfig(adapter, cfgPath);
        const serverConfig = Object.values(servers)[0];

        expect(serverConfig).toHaveProperty('transport');
        expect(serverConfig).toHaveProperty('transport.type', 'http');
        expect(serverConfig).toHaveProperty('transport.url', 'http://127.0.0.1:4269/mcp');
      });

      it('generates HTTP transport config for Claude Code', () => {
        const cfgPath = createConfig('http-claude-code');
        const adapter = getAdapter('claude-code');

        const { servers } = generateMcpClientConfig(adapter, cfgPath);
        const serverConfig = Object.values(servers)[0];

        expect(serverConfig).toHaveProperty('transport');
        expect(serverConfig).toHaveProperty('transport.type', 'http');
        expect(serverConfig).toHaveProperty('transport.url', 'http://127.0.0.1:4269/mcp');
      });

      it('generates HTTP transport config for Codex', () => {
        const cfgPath = createConfig('http-codex');
        const adapter = getAdapter('codex');

        const { servers } = generateMcpClientConfig(adapter, cfgPath);
        const serverConfig = Object.values(servers)[0];

        expect(serverConfig).toHaveProperty('transport');
        expect(serverConfig).toHaveProperty('transport.type', 'http');
        expect(serverConfig).toHaveProperty('transport.url', 'http://127.0.0.1:4269/mcp');
      });

      it('generates HTTP transport config for OpenCode', () => {
        const cfgPath = createConfig('http-opencode');
        const adapter = getLocalAdapter('opencode');

        const { servers } = generateMcpClientConfig(adapter, cfgPath);
        const serverConfig = Object.values(servers)[0];

        expect(serverConfig).toHaveProperty('transport');
        expect(serverConfig).toHaveProperty('transport.type', 'http');
        expect(serverConfig).toHaveProperty('transport.url', 'http://127.0.0.1:4269/mcp');
      });
    });

    describe('custom HTTP server configuration', () => {
      it('respects custom port from config.json', () => {
        const projectDir = join(configDir, 'custom-port');
        mkdirSync(projectDir, { recursive: true });
        const cfgPath = join(projectDir, 'config.json');

        const config = {
          plansPath: join(testDir, 'custom-port', 'plans'),
          dataPath: join(testDir, 'custom-port', 'data'),
          server: {
            port: 8080,
            host: '127.0.0.1',
          },
          scoring: {
            weights: { dependency: 40, priority: 30, workload: 30 },
            biases: {},
          },
        };
        writeFileSync(cfgPath, JSON.stringify(config, null, 2));

        const adapter = getAdapter('claude-code');
        const { servers } = generateMcpClientConfig(adapter, cfgPath);
        const serverConfig = Object.values(servers)[0];

        expect(serverConfig).toHaveProperty('transport.url', 'http://127.0.0.1:8080/mcp');
      });

      it('respects custom host from config.json', () => {
        const projectDir = join(configDir, 'custom-host');
        mkdirSync(projectDir, { recursive: true });
        const cfgPath = join(projectDir, 'config.json');

        const config = {
          plansPath: join(testDir, 'custom-host', 'plans'),
          dataPath: join(testDir, 'custom-host', 'data'),
          server: {
            port: 4269,
            host: '0.0.0.0',
          },
          scoring: {
            weights: { dependency: 40, priority: 30, workload: 30 },
            biases: {},
          },
        };
        writeFileSync(cfgPath, JSON.stringify(config, null, 2));

        const adapter = getAdapter('claude-code');
        const { servers } = generateMcpClientConfig(adapter, cfgPath);
        const serverConfig = Object.values(servers)[0];

        expect(serverConfig).toHaveProperty('transport.url', 'http://0.0.0.0:4269/mcp');
      });
    });

    describe('generateConfigForPrint', () => {
      it('generates HTTP transport config by default', () => {
        const cfgPath = createConfig('print-default');
        const adapter = getAdapter('claude-code');

        const output = generateConfigForPrint(adapter, cfgPath);

        expect(output).toContain('"transport"');
        expect(output).toContain('"type": "http"');
        expect(output).toContain('http://127.0.0.1:4269/mcp');
      });
    });

    describe('TOML format for Codex', () => {
      it('generates TOML format for HTTP transport', () => {
        const cfgPath = createConfig('toml-http');
        const adapter = getAdapter('codex');

        const output = generateConfigForPrint(adapter, cfgPath);

        expect(output).toContain('[mcp_servers.');
        expect(output).toContain('.transport]');
        expect(output).toContain('type = "http"');
        expect(output).toContain('url = "http://127.0.0.1:4269/mcp"');
      });
    });
  });
});
