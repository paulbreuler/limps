import { Notice, Plugin } from 'obsidian';
import { readFileSync } from 'node:fs';
import { getDaemonStatus, getGraphHealth, runDepsToPaths, runGraphReindex } from './cli/wrapper.js';
import type { LimpsRunOptions } from './cli/wrapper.js';
import { DEFAULT_SETTINGS, LimpsSettingTab } from './settings.js';
import type { LimpsPluginSettings } from './settings.js';
import { HealthView } from './views/healthView.js';
import { syncObsidianGraphLinks } from './graph/syncLinks.js';
import { probeObsidianMcp } from './mcp/client.js';
import type { ObsidianMcpProbeResult } from './mcp/client.js';
import { buildRuntimeStatusLabel, computeLinkStats } from './status/runtimeStatus.js';

export const VIEW_TYPE_HEALTH = 'limps-health-view';
const REQUIRED_START_COMMAND = 'limps server start --config /Users/paul/Documents/GitHub/limps/.limps/config.json';

export type HealthSnapshotState = 'disconnected' | 'loading' | 'healthy' | 'healthy-empty' | 'error';

export interface HealthSnapshot {
  state: HealthSnapshotState;
  message?: string;
  health?: {
    summary: {
      totalEntities: number;
      totalRelations: number;
      conflictCount: number;
      errorCount: number;
      warningCount: number;
      lastIndexed: string;
    };
  };
}

export default class LimpsPlugin extends Plugin {
  settings: LimpsPluginSettings = DEFAULT_SETTINGS;
  private disconnectedNoticeShown = false;
  private statusBarEl: HTMLElement | null = null;
  private eventRefreshTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private statusRefreshInFlight = false;
  private statusRefreshPending = false;
  private lastMcpProbe: ObsidianMcpProbeResult | null = null;
  private lastMcpProbeAt = 0;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_HEALTH, (leaf) => new HealthView(leaf, this));
    this.addSettingTab(new LimpsSettingTab(this.app, this));

    if (this.settings.showHealthRibbon) {
      this.addRibbonIcon('activity', 'Open limps Health', () => {
        void this.openHealthView();
      });
    }

    this.registerCommands();
    this.registerObsidianEventHooks();

    if (this.settings.showStatusBar) {
      this.statusBarEl = this.addStatusBarItem();
      this.statusBarEl.textContent = 'limps daemon:unknown links:r0/u0 mcp:off';
    }

    const interval = setInterval(() => {
      void this.pollRuntimeStatus();
    }, Math.max(2000, this.settings.healthRefreshMs));
    this.registerInterval(interval as unknown as number);

    await this.notifyIfDisconnected();
    await this.pollRuntimeStatus();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<LimpsPluginSettings> | null;
    const merged = {
      ...DEFAULT_SETTINGS,
      ...(saved ?? {}),
    };
    const hasExplicitBinaryMode =
      saved !== null && Object.prototype.hasOwnProperty.call(saved, 'useSystemLimpsBinary');

    this.settings = {
      ...merged,
      useSystemLimpsBinary: hasExplicitBinaryMode
        ? Boolean(merged.useSystemLimpsBinary)
        : true,
    };
  }

  async getHealthSnapshot(): Promise<HealthSnapshot> {
    const daemon = await getDaemonStatus(this.getRunOptions(true));
    if (!daemon.ok) {
      return {
        state: 'error',
        message: daemon.error,
      };
    }

    if (!daemon.daemon?.running) {
      return {
        state: 'disconnected',
        message: `Daemon not running. Run: ${REQUIRED_START_COMMAND}`,
      };
    }

    const health = await getGraphHealth(this.getRunOptions(true));
    if (!health.ok || !health.health) {
      return {
        state: 'error',
        message: health.error ?? 'Failed to fetch limps graph health',
      };
    }

    if (health.health.summary.totalEntities === 0) {
      return {
        state: 'healthy-empty',
        health: health.health,
      };
    }

    return {
      state: 'healthy',
      health: health.health,
    };
  }

  private registerCommands(): void {
    this.addCommand({
      id: 'limps:check-daemon-status',
      name: 'limps: Check Daemon Status',
      callback: async () => {
        await this.checkDaemonStatus();
      },
    });

    this.addCommand({
      id: 'limps:open-health-view',
      name: 'limps: Open Health View',
      callback: async () => {
        await this.openHealthView();
      },
    });

    this.addCommand({
      id: 'limps:refresh-health-view',
      name: 'limps: Refresh Health View',
      callback: async () => {
        await this.refreshHealthView(true);
      },
    });

    this.addCommand({
      id: 'limps:graph-reindex',
      name: 'limps: Graph Reindex',
      callback: async () => {
        await this.graphReindex();
      },
    });

    this.addCommand({
      id: 'limps:convert-deps-to-paths',
      name: 'limps: Convert Dependencies To Paths',
      callback: async () => {
        await this.convertDependenciesToPaths();
      },
    });

    this.addCommand({
      id: 'limps:sync-obsidian-graph-links',
      name: 'limps: Sync Obsidian Graph Links',
      callback: async () => {
        await this.syncObsidianGraphLinks();
      },
    });

    this.addCommand({
      id: 'limps:check-obsidian-mcp',
      name: 'limps: Check Obsidian MCP',
      callback: async () => {
        await this.checkObsidianMcp();
      },
    });
  }

  async checkDaemonStatus(): Promise<void> {
    const status = await getDaemonStatus(this.getRunOptions(true));
    if (!status.ok || !status.daemon) {
      new Notice(`limps daemon check failed: ${status.error ?? 'unknown error'}`, 7000);
      return;
    }

    if (status.daemon.running) {
      const host = status.daemon.host ?? '127.0.0.1';
      const port = status.daemon.port ?? 4269;
      new Notice(`limps daemon running on ${host}:${port}`, 4000);
      await this.updateStatusBar();
      return;
    }

    new Notice(`limps daemon is not running. Run: ${REQUIRED_START_COMMAND}`, 9000);
    await this.updateStatusBar();
  }

  async graphReindex(): Promise<void> {
    const result = await runGraphReindex(this.getRunOptions(false));
    if (!result.ok) {
      const details = result.stderr || result.error || 'unknown error';
      new Notice(`limps graph reindex failed: ${details}`, 8000);
      return;
    }

    new Notice('limps graph reindex completed', 4000);
    await this.pollRuntimeStatus();
  }

  async syncObsidianGraphLinks(): Promise<void> {
    try {
      const conversion = await this.convertDependenciesToPaths(false);
      if (!conversion.ok || !conversion.result) {
        return;
      }

      const plansPath = this.getPlansPathFromConfig();
      const result = syncObsidianGraphLinks(this.getVaultPath(), plansPath);
      const warningText = result.warnings.length > 0 ? ` (${result.warnings.length} warnings)` : '';
      new Notice(
        `limps deps converted ${conversion.result.dependenciesConverted}, graph links updated ${result.filesUpdated}/${result.filesScanned}${warningText}`,
        9000
      );
      await this.pollRuntimeStatus();
    } catch (error) {
      new Notice(`limps graph-link sync failed: ${String(error)}`, 9000);
    }
  }

  async convertDependenciesToPaths(showNotice = true): Promise<{
    ok: boolean;
    result?: { dependenciesConverted: number; filesUpdated: number; filesScanned: number; warnings: string[] };
  }> {
    const conversion = await runDepsToPaths(this.getRunOptions(true));
    if (!conversion.ok || !conversion.result) {
      if (showNotice) {
        new Notice(
          `limps dependency path conversion failed: ${conversion.error ?? 'unknown error'}`,
          9000
        );
      }
      return { ok: false };
    }

    if (showNotice) {
      const warningText =
        conversion.result.warnings.length > 0 ? ` (${conversion.result.warnings.length} warnings)` : '';
      new Notice(
        `limps deps converted ${conversion.result.dependenciesConverted}, files updated ${conversion.result.filesUpdated}/${conversion.result.filesScanned}${warningText}`,
        9000
      );
    }

    return {
      ok: true,
      result: {
        dependenciesConverted: conversion.result.dependenciesConverted,
        filesUpdated: conversion.result.filesUpdated,
        filesScanned: conversion.result.filesScanned,
        warnings: conversion.result.warnings,
      },
    };
  }

  async checkObsidianMcp(showNotice = true): Promise<ObsidianMcpProbeResult> {
    if (!this.settings.enableObsidianMcp) {
      const disabled: ObsidianMcpProbeResult = {
        ok: false,
        error: 'Obsidian MCP checks are disabled in plugin settings.',
      };
      if (showNotice) {
        new Notice(disabled.error ?? 'Obsidian MCP checks are disabled.', 7000);
      }
      this.lastMcpProbe = disabled;
      return disabled;
    }

    const result =
      this.settings.obsidianMcpTransport === 'stdio'
        ? await probeObsidianMcp({
            transport: 'stdio',
            command: this.settings.obsidianMcpCommand,
            args: this.parseCommandArgs(this.settings.obsidianMcpArgs),
            cwd: this.settings.obsidianMcpCwd || this.getVaultPath(),
            timeoutMs: this.settings.obsidianMcpTimeoutMs,
          })
        : await probeObsidianMcp({
            transport: 'http',
            endpoint: this.settings.obsidianMcpEndpoint,
            timeoutMs: this.settings.obsidianMcpTimeoutMs,
          });
    this.lastMcpProbe = result;
    this.lastMcpProbeAt = Date.now();

    if (!showNotice) {
      return result;
    }

    if (!result.ok) {
      new Notice(`Obsidian MCP check failed: ${result.error ?? 'unknown error'}`, 9000);
      await this.updateStatusBar();
      return result;
    }

    if (result.transport === 'http-jsonrpc' || result.transport === 'stdio-jsonrpc') {
      const serverName = result.serverInfo?.name ?? 'unknown';
      const serverVersion = result.serverInfo?.version ? ` ${result.serverInfo.version}` : '';
      new Notice(
        `Obsidian MCP connected via ${result.transport} (${serverName}${serverVersion}), tools: ${result.toolsCount ?? 0}`,
        7000
      );
      await this.updateStatusBar();
      return result;
    }

    new Notice('Obsidian MCP reachable via /health endpoint', 5000);
    await this.updateStatusBar();
    return result;
  }

  private async notifyIfDisconnected(): Promise<void> {
    if (this.disconnectedNoticeShown) return;

    const status = await getDaemonStatus(this.getRunOptions(true));
    if (status.ok && status.daemon?.running) return;

    this.disconnectedNoticeShown = true;
    new Notice(`limps daemon required. Run: ${REQUIRED_START_COMMAND}`, 10000);
  }

  async openHealthView(): Promise<void> {
    const leaf = this.app.workspace.getRightLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE_HEALTH, active: true });
    await this.app.workspace.revealLeaf(leaf);
    await this.pollRuntimeStatus();
  }

  async refreshHealthView(forceOpen = false): Promise<void> {
    const view = this.getHealthView();
    if (!view) {
      if (!forceOpen) return;
      await this.openHealthView();
      return;
    }

    await view.refresh();
  }

  private getHealthView(): HealthView | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_HEALTH);
    if (leaves.length === 0) return null;

    const view = leaves[0].view;
    return view instanceof HealthView ? view : null;
  }

  private getRunOptions(parseJson: boolean): LimpsRunOptions {
    const limpsPath = this.settings.useSystemLimpsBinary
      ? 'limps'
      : this.settings.limpsPath || DEFAULT_SETTINGS.limpsPath;

    return {
      limpsPath,
      configPath: this.settings.configPath,
      cwd: this.getVaultPath(),
      timeoutMs: this.settings.commandTimeoutMs,
      parseJson,
    };
  }

  private getVaultPath(): string {
    const adapter = this.app.vault.adapter as { basePath?: string };
    return adapter.basePath ?? process.cwd();
  }

  private getPlansPathFromConfig(): string {
    const configPath = this.settings.configPath;
    if (!configPath) {
      throw new Error('No limps config path is set in plugin settings.');
    }

    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as { plansPath?: string };
    if (!parsed.plansPath || typeof parsed.plansPath !== 'string') {
      throw new Error(`Invalid limps config at ${configPath}: missing plansPath`);
    }
    return parsed.plansPath;
  }

  private parseCommandArgs(raw: string): string[] {
    const value = raw.trim();
    if (!value) return [];
    const parts: string[] = [];
    const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(value)) !== null) {
      parts.push(match[1] ?? match[2] ?? match[3] ?? '');
    }
    return parts.filter(Boolean);
  }

  private registerObsidianEventHooks(): void {
    const registerEvent = (target: unknown, name: string): void => {
      const emitter = target as { on?: (eventName: string, cb: (...args: unknown[]) => unknown) => unknown };
      if (!emitter || typeof emitter.on !== 'function') return;

      const ref = emitter.on(name, () => {
        this.scheduleRuntimeRefresh();
      });

      if (typeof this.registerEvent === 'function' && ref) {
        this.registerEvent(ref);
      }
    };

    registerEvent(this.app.workspace, 'file-open');
    registerEvent(this.app.workspace, 'active-leaf-change');
    registerEvent(this.app.vault, 'create');
    registerEvent(this.app.vault, 'modify');
    registerEvent(this.app.vault, 'rename');
    registerEvent(this.app.vault, 'delete');
    registerEvent(this.app.metadataCache, 'changed');
    registerEvent(this.app.metadataCache, 'resolved');
  }

  private scheduleRuntimeRefresh(): void {
    const debounceMs = Math.max(200, this.settings.eventRefreshDebounceMs);
    if (this.eventRefreshTimeoutId !== null) {
      clearTimeout(this.eventRefreshTimeoutId);
    }

    this.eventRefreshTimeoutId = setTimeout(() => {
      this.eventRefreshTimeoutId = null;
      void this.pollRuntimeStatus();
    }, debounceMs);
  }

  private async pollRuntimeStatus(): Promise<void> {
    await this.refreshHealthView();
    await this.updateStatusBar();
  }

  private async updateStatusBar(): Promise<void> {
    if (!this.settings.showStatusBar || !this.statusBarEl) return;

    if (this.statusRefreshInFlight) {
      this.statusRefreshPending = true;
      return;
    }

    this.statusRefreshInFlight = true;
    try {
      const status = await getDaemonStatus(this.getRunOptions(true));
      const daemonRunning = Boolean(status.ok && status.daemon?.running);
      const links = computeLinkStats(this.app.metadataCache?.resolvedLinks, this.app.metadataCache?.unresolvedLinks);

      let mcpConnected = false;
      if (this.settings.enableObsidianMcp) {
        const now = Date.now();
        const staleMs = Math.max(1000, this.settings.healthRefreshMs);
        if (!this.lastMcpProbe || now - this.lastMcpProbeAt > staleMs) {
          const probe = await this.checkObsidianMcp(false);
          this.lastMcpProbe = probe;
          this.lastMcpProbeAt = now;
        }
        mcpConnected = Boolean(this.lastMcpProbe?.ok);
      }

      this.statusBarEl.textContent = buildRuntimeStatusLabel({
        daemonRunning,
        links,
        mcpEnabled: this.settings.enableObsidianMcp,
        mcpConnected,
      });
      this.statusBarEl.title = 'limps runtime governance status';
    } finally {
      this.statusRefreshInFlight = false;
      if (this.statusRefreshPending) {
        this.statusRefreshPending = false;
        void this.updateStatusBar();
      }
    }
  }

  onunload(): void {
    if (this.eventRefreshTimeoutId !== null) {
      clearTimeout(this.eventRefreshTimeoutId);
      this.eventRefreshTimeoutId = null;
    }
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_HEALTH);
    for (const leaf of leaves) {
      void leaf.setViewState({ type: 'empty' });
    }
  }
}
