import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type LimpsPlugin from './main.js';

export interface LimpsPluginSettings {
  useSystemLimpsBinary: boolean;
  limpsPath: string;
  configPath: string;
  commandTimeoutMs: number;
  healthRefreshMs: number;
  eventRefreshDebounceMs: number;
  showHealthRibbon: boolean;
  showStatusBar: boolean;
  enablePersistentMcp: boolean;
  mcpEndpoint: string;
  mcpKeepaliveIntervalMs: number;
  mcpReconnectMaxAttempts: number;
  enableObsidianMcp: boolean;
  obsidianMcpTransport: 'http' | 'stdio';
  obsidianMcpEndpoint: string;
  obsidianMcpCommand: string;
  obsidianMcpArgs: string;
  obsidianMcpCwd: string;
  obsidianMcpTimeoutMs: number;
  enableScheduledHealthChecks: boolean;
  healthCheckIntervalMs: number;
  autoReindexOnChange: boolean;
  autoApplyProposals: boolean;
  autoApplyProposalTypes: string[];
  notifyOnIssuesFound: boolean;
}

export const DEFAULT_SETTINGS: LimpsPluginSettings = {
  useSystemLimpsBinary: true,
  limpsPath: 'limps',
  configPath: '',
  commandTimeoutMs: 5000,
  healthRefreshMs: 10000,
  eventRefreshDebounceMs: 750,
  showHealthRibbon: true,
  showStatusBar: true,
  enablePersistentMcp: true,
  mcpEndpoint: 'http://127.0.0.1:4269/mcp',
  mcpKeepaliveIntervalMs: 840_000,
  mcpReconnectMaxAttempts: 10,
  enableObsidianMcp: false,
  obsidianMcpTransport: 'http',
  obsidianMcpEndpoint: 'http://127.0.0.1:3000/mcp',
  obsidianMcpCommand: 'mcp-obsidian',
  obsidianMcpArgs: '',
  obsidianMcpCwd: '',
  obsidianMcpTimeoutMs: 2500,
  enableScheduledHealthChecks: false,
  healthCheckIntervalMs: 14_400_000,
  autoReindexOnChange: true,
  autoApplyProposals: false,
  autoApplyProposalTypes: ['frontmatter_cleanup', 'staleness_update', 'link_normalization'],
  notifyOnIssuesFound: true,
};

export class LimpsSettingTab extends PluginSettingTab {
  private readonly plugin: LimpsPlugin;

  constructor(app: App, plugin: LimpsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.innerHTML = '';
    this.renderSectionHeader(
      containerEl,
      'Binary & Paths',
      'Configure how limps commands are executed and which config file is used.'
    );

    new Setting(containerEl)
      .setName('Use system limps binary')
      .setDesc('Recommended: use limps from PATH (npm/global install). Disable for local dev builds.')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.useSystemLimpsBinary).onChange(async (value) => {
          this.plugin.settings.useSystemLimpsBinary = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    const suggestedRepoPath = this.plugin.getSuggestedRepoBinaryPath();
    new Setting(containerEl)
      .setName('Repo binary helper')
      .setDesc(`Auto-detect from config path: ${suggestedRepoPath}`)
      .addButton((button) => {
        button.setButtonText('Use repo binary').onClick(async () => {
          const result = await this.plugin.useRepoBinaryPath();
          if (!result.ok) {
            new Notice(result.message, 9000);
            return;
          }

          new Notice(`limps binary path set to ${result.path}`, 7000);
          this.display();
        });
      });

    if (!this.plugin.settings.useSystemLimpsBinary) {
      new Setting(containerEl)
        .setName('limps binary path')
        .setDesc('Path to limps executable. If you give a directory, plugin tries dist/cli.js automatically.')
        .addText((text) => {
          text
            .setPlaceholder('/path/to/limps')
            .setValue(this.plugin.settings.limpsPath)
            .onChange(async (value) => {
              this.plugin.settings.limpsPath = value.trim() || DEFAULT_SETTINGS.limpsPath;
              await this.plugin.saveSettings();
              this.display();
            });
        });

      new Setting(containerEl)
        .setName('Effective binary path')
        .setDesc(this.plugin.getEffectiveBinaryPathPreview());
    }

    new Setting(containerEl)
      .setName('Config path')
      .setDesc('Path to limps config file. Leave empty to auto-discover .limps/config.json from vault directory.')
      .addText((text) => {
        text
          .setPlaceholder('(auto-discover from vault)')
          .setValue(this.plugin.settings.configPath)
          .onChange(async (value) => {
            this.plugin.settings.configPath = value.trim();
            await this.plugin.saveSettings();
            this.display();
          });
      });

    const resolvedConfig = this.plugin.getResolvedConfigPath();
    if (resolvedConfig) {
      new Setting(containerEl)
        .setName('Resolved config')
        .setDesc(resolvedConfig);
    } else if (!this.plugin.settings.configPath) {
      new Setting(containerEl)
        .setName('Resolved config')
        .setDesc('No .limps/config.json found in vault directory tree');
    }

    this.renderSectionHeader(
      containerEl,
      'Runtime',
      'Control command timeout and auto-refresh behavior for health/runtime checks.'
    );

    new Setting(containerEl)
      .setName('Command timeout (ms)')
      .setDesc('Maximum time to wait for a limps command before failing')
      .addSlider((slider) => {
        slider
          .setLimits(1000, 30000, 500)
          .setValue(this.plugin.settings.commandTimeoutMs)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.commandTimeoutMs = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Health refresh interval (ms)')
      .setDesc('Auto-refresh cadence for the limps health sidebar')
      .addSlider((slider) => {
        slider
          .setLimits(2000, 60000, 1000)
          .setValue(this.plugin.settings.healthRefreshMs)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.healthRefreshMs = value;
            await this.plugin.saveSettings();
          });
      });

    this.renderSectionHeader(
      containerEl,
      'UI',
      'Toggle health entry points and runtime indicators shown in Obsidian.'
    );

    new Setting(containerEl)
      .setName('Show health ribbon icon')
      .setDesc('Show an icon in the left ribbon to open limps health')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showHealthRibbon).onChange(async (value) => {
          this.plugin.settings.showHealthRibbon = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Show status bar indicator')
      .setDesc('Show daemon/link/MCP governance summary in the status bar (desktop)')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showStatusBar).onChange(async (value) => {
          this.plugin.settings.showStatusBar = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Event refresh debounce (ms)')
      .setDesc('Debounce for vault/workspace/metadata-triggered refresh')
      .addSlider((slider) => {
        slider
          .setLimits(200, 5000, 50)
          .setValue(this.plugin.settings.eventRefreshDebounceMs)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.eventRefreshDebounceMs = value;
            await this.plugin.saveSettings();
          });
      });

    this.renderSectionHeader(
      containerEl,
      'Scheduled Health Checks',
      'Periodically run health checks against the limps daemon to detect staleness, drift, and conflicts.'
    );

    new Setting(containerEl)
      .setName('Enable scheduled health checks')
      .setDesc('Periodically run health checks in the background')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.enableScheduledHealthChecks).onChange(async (value) => {
          this.plugin.settings.enableScheduledHealthChecks = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (this.plugin.settings.enableScheduledHealthChecks) {
      new Setting(containerEl)
        .setName('Health check interval (hours)')
        .setDesc('How often to run scheduled health checks')
        .addSlider((slider) => {
          slider
            .setLimits(1, 24, 1)
            .setValue(Math.round(this.plugin.settings.healthCheckIntervalMs / 3_600_000))
            .setDynamicTooltip()
            .onChange(async (value) => {
              this.plugin.settings.healthCheckIntervalMs = value * 3_600_000;
              await this.plugin.saveSettings();
            });
        });
    }

    new Setting(containerEl)
      .setName('Auto-reindex on change')
      .setDesc('Automatically trigger graph reindex when plan files are modified')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.autoReindexOnChange).onChange(async (value) => {
          this.plugin.settings.autoReindexOnChange = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Auto-apply proposals')
      .setDesc('Automatically apply safe proposals of whitelisted types after health checks')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.autoApplyProposals).onChange(async (value) => {
          this.plugin.settings.autoApplyProposals = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (this.plugin.settings.autoApplyProposals) {
      new Setting(containerEl)
        .setName('Auto-apply proposal types')
        .setDesc('Comma-separated list of proposal types to auto-apply (e.g. frontmatter_cleanup, staleness_update, link_normalization)')
        .addText((text) => {
          text
            .setPlaceholder('frontmatter_cleanup, staleness_update, link_normalization')
            .setValue(this.plugin.settings.autoApplyProposalTypes.join(', '))
            .onChange(async (value) => {
              this.plugin.settings.autoApplyProposalTypes = value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              await this.plugin.saveSettings();
            });
        });
    }

    new Setting(containerEl)
      .setName('Notify on issues found')
      .setDesc('Show Obsidian notifications when health checks or auto-fix operations find issues')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.notifyOnIssuesFound).onChange(async (value) => {
          this.plugin.settings.notifyOnIssuesFound = value;
          await this.plugin.saveSettings();
        });
      });

    this.renderSectionHeader(
      containerEl,
      'Persistent MCP Connection',
      'Maintain a persistent MCP session to the limps HTTP daemon for real-time tool access.'
    );

    new Setting(containerEl)
      .setName('Enable persistent MCP')
      .setDesc('Keep a live MCP session to the daemon with auto-reconnect and keepalive')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.enablePersistentMcp).onChange(async (value) => {
          this.plugin.settings.enablePersistentMcp = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (this.plugin.settings.enablePersistentMcp) {
      new Setting(containerEl)
        .setName('MCP endpoint')
        .setDesc('HTTP endpoint for the limps MCP daemon')
        .addText((text) => {
          text
            .setPlaceholder('http://127.0.0.1:4269/mcp')
            .setValue(this.plugin.settings.mcpEndpoint)
            .onChange(async (value) => {
              this.plugin.settings.mcpEndpoint =
                value.trim() || DEFAULT_SETTINGS.mcpEndpoint;
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName('Keepalive interval (ms)')
        .setDesc('How often to ping the daemon to keep the session alive')
        .addSlider((slider) => {
          slider
            .setLimits(30_000, 1_800_000, 30_000)
            .setValue(this.plugin.settings.mcpKeepaliveIntervalMs)
            .setDynamicTooltip()
            .onChange(async (value) => {
              this.plugin.settings.mcpKeepaliveIntervalMs = value;
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName('Max reconnect attempts')
        .setDesc('Number of reconnect attempts before falling back to CLI')
        .addSlider((slider) => {
          slider
            .setLimits(1, 20, 1)
            .setValue(this.plugin.settings.mcpReconnectMaxAttempts)
            .setDynamicTooltip()
            .onChange(async (value) => {
              this.plugin.settings.mcpReconnectMaxAttempts = value;
              await this.plugin.saveSettings();
            });
        });
    }

    this.renderSectionHeader(
      containerEl,
      'Obsidian MCP',
      'Probe an Obsidian MCP server so AI workflows can verify vault governance paths.'
    );

    new Setting(containerEl)
      .setName('Enable Obsidian MCP checks')
      .setDesc('Probe a configured Obsidian MCP server so AI workflows can govern vault operations')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.enableObsidianMcp).onChange(async (value) => {
          this.plugin.settings.enableObsidianMcp = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (this.plugin.settings.enableObsidianMcp) {
      new Setting(containerEl)
        .setName('Use stdio MCP transport')
        .setDesc('Enable for stdio MCP servers (for example mcp-obsidian); disable for HTTP MCP endpoints')
        .addToggle((toggle) => {
          toggle
            .setValue(this.plugin.settings.obsidianMcpTransport === 'stdio')
            .onChange(async (value) => {
              this.plugin.settings.obsidianMcpTransport = value ? 'stdio' : 'http';
              await this.plugin.saveSettings();
              this.display();
            });
        });

      if (this.plugin.settings.obsidianMcpTransport === 'stdio') {
        new Setting(containerEl)
          .setName('Obsidian MCP command')
          .setDesc('Executable used to start the stdio MCP server')
          .addText((text) => {
            text
              .setPlaceholder('mcp-obsidian')
              .setValue(this.plugin.settings.obsidianMcpCommand)
              .onChange(async (value) => {
                this.plugin.settings.obsidianMcpCommand = value.trim() || DEFAULT_SETTINGS.obsidianMcpCommand;
                await this.plugin.saveSettings();
              });
          });

        new Setting(containerEl)
          .setName('Obsidian MCP args')
          .setDesc('Optional command args (space separated)')
          .addText((text) => {
            text
              .setPlaceholder('--vault /path/to/vault')
              .setValue(this.plugin.settings.obsidianMcpArgs)
              .onChange(async (value) => {
                this.plugin.settings.obsidianMcpArgs = value;
                await this.plugin.saveSettings();
              });
          });

        new Setting(containerEl)
          .setName('Obsidian MCP cwd')
          .setDesc('Optional working directory for stdio command; default is current vault path')
          .addText((text) => {
            text
              .setPlaceholder('/path/to/project')
              .setValue(this.plugin.settings.obsidianMcpCwd)
              .onChange(async (value) => {
                this.plugin.settings.obsidianMcpCwd = value.trim();
                await this.plugin.saveSettings();
              });
          });
      } else {
        new Setting(containerEl)
          .setName('Obsidian MCP endpoint')
          .setDesc('HTTP endpoint for MCP probe (JSON-RPC endpoint, health fallback on /health)')
          .addText((text) => {
            text
              .setPlaceholder('http://127.0.0.1:3000/mcp')
              .setValue(this.plugin.settings.obsidianMcpEndpoint)
              .onChange(async (value) => {
                this.plugin.settings.obsidianMcpEndpoint =
                  value.trim() || DEFAULT_SETTINGS.obsidianMcpEndpoint;
                await this.plugin.saveSettings();
              });
          });
      }

      new Setting(containerEl)
        .setName('Obsidian MCP timeout (ms)')
        .setDesc('Maximum time to wait for MCP probe requests')
        .addSlider((slider) => {
          slider
            .setLimits(200, 10000, 100)
            .setValue(this.plugin.settings.obsidianMcpTimeoutMs)
            .setDynamicTooltip()
            .onChange(async (value) => {
              this.plugin.settings.obsidianMcpTimeoutMs = value;
              await this.plugin.saveSettings();
            });
        });
    }
  }

  private renderSectionHeader(containerEl: HTMLElement, title: string, description: string): void {
    const section = document.createElement('div');
    section.className = 'limps-settings-section';

    const heading = document.createElement('h3');
    heading.textContent = title;

    const desc = document.createElement('p');
    desc.textContent = description;

    section.appendChild(heading);
    section.appendChild(desc);
    containerEl.appendChild(section);
  }
}
