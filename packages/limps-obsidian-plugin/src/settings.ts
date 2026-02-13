import { App, PluginSettingTab, Setting } from 'obsidian';
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
  enableObsidianMcp: boolean;
  obsidianMcpTransport: 'http' | 'stdio';
  obsidianMcpEndpoint: string;
  obsidianMcpCommand: string;
  obsidianMcpArgs: string;
  obsidianMcpCwd: string;
  obsidianMcpTimeoutMs: number;
}

export const DEFAULT_SETTINGS: LimpsPluginSettings = {
  useSystemLimpsBinary: true,
  limpsPath: 'limps',
  configPath: '/Users/paul/Documents/GitHub/limps/.limps/config.json',
  commandTimeoutMs: 5000,
  healthRefreshMs: 10000,
  eventRefreshDebounceMs: 750,
  showHealthRibbon: true,
  showStatusBar: true,
  enableObsidianMcp: false,
  obsidianMcpTransport: 'http',
  obsidianMcpEndpoint: 'http://127.0.0.1:3000/mcp',
  obsidianMcpCommand: 'mcp-obsidian',
  obsidianMcpArgs: '',
  obsidianMcpCwd: '',
  obsidianMcpTimeoutMs: 2500,
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

    if (!this.plugin.settings.useSystemLimpsBinary) {
      new Setting(containerEl)
      .setName('limps binary path')
        .setDesc('Path to the limps executable (used only when system binary is disabled)')
        .addText((text) => {
          text
            .setPlaceholder('/path/to/limps')
            .setValue(this.plugin.settings.limpsPath)
            .onChange(async (value) => {
              this.plugin.settings.limpsPath = value.trim() || DEFAULT_SETTINGS.limpsPath;
              await this.plugin.saveSettings();
            });
        });
    }

    new Setting(containerEl)
      .setName('Config path')
      .setDesc('Path to limps config file used for all commands')
      .addText((text) => {
        text
          .setPlaceholder('/path/to/.limps/config.json')
          .setValue(this.plugin.settings.configPath)
          .onChange(async (value) => {
            this.plugin.settings.configPath = value.trim();
            await this.plugin.saveSettings();
          });
      });

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
}
