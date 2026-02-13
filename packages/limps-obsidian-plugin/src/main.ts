import { Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getDaemonStatus, getGraphHealth, runDepsToPaths, runGraphReindex } from './cli/wrapper.js';
import type { LimpsRunOptions } from './cli/wrapper.js';
import { DEFAULT_SETTINGS, LimpsSettingTab } from './settings.js';
import type { LimpsPluginSettings } from './settings.js';
import { HealthView } from './views/healthView.js';
import { DirectedGraphView } from './views/directedGraphView.js';
import { syncObsidianGraphLinks } from './graph/syncLinks.js';
import { auditObsidianSurfaces } from './graph/surfaceAudit.js';
import { probeObsidianMcp } from './mcp/client.js';
import type { ObsidianMcpProbeResult } from './mcp/client.js';
import { buildRuntimeStatusLabel, computeLinkStats } from './status/runtimeStatus.js';

export const VIEW_TYPE_HEALTH = 'limps-health-view';
export const VIEW_TYPE_DIRECTED_GRAPH = 'limps-directed-graph-view';

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
    this.registerView(VIEW_TYPE_DIRECTED_GRAPH, (leaf) => new DirectedGraphView(leaf, this));
    this.addSettingTab(new LimpsSettingTab(this.app, this));

    if (this.settings.showHealthRibbon) {
      this.addRibbonIcon('activity', 'Open Local Intelligence Hub', () => {
        void this.openHealthView();
      });
    }

    this.registerCommands();
    this.registerObsidianEventHooks();
    this.registerContextMenuHooks();

    if (this.settings.showStatusBar) {
      this.statusBarEl = this.addStatusBarItem();
      this.statusBarEl.textContent = 'local-intel daemon:unknown links:r0/u0 mcp:off';
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
        message: `Daemon not running. Run: ${this.getDaemonStartCommand()}`,
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
      name: 'Local Intelligence: Check Daemon Status',
      callback: async () => {
        await this.checkDaemonStatus();
      },
    });

    this.addCommand({
      id: 'limps:open-health-view',
      name: 'Local Intelligence: Open Hub',
      callback: async () => {
        await this.openHealthView();
      },
    });

    this.addCommand({
      id: 'limps:refresh-health-view',
      name: 'Local Intelligence: Refresh Hub',
      callback: async () => {
        await this.refreshHealthView(true);
      },
    });

    this.addCommand({
      id: 'limps:graph-reindex',
      name: 'Local Intelligence: Graph Reindex',
      callback: async () => {
        await this.graphReindex();
      },
    });

    this.addCommand({
      id: 'limps:open-directed-graph-view',
      name: 'Local Intelligence: Open Directed Graph (Editor)',
      callback: async () => {
        await this.openDirectedGraphView();
      },
    });

    this.addCommand({
      id: 'limps:refresh-directed-graph-view',
      name: 'Local Intelligence: Refresh Directed Graph',
      callback: async () => {
        await this.refreshDirectedGraphView(true);
      },
    });

    this.addCommand({
      id: 'limps:convert-deps-to-paths',
      name: 'Local Intelligence: Convert Dependencies To Paths',
      callback: async () => {
        await this.convertDependenciesToPaths();
      },
    });

    this.addCommand({
      id: 'limps:sync-obsidian-graph-links',
      name: 'Local Intelligence: Sync Obsidian Graph Links',
      callback: async () => {
        await this.syncObsidianGraphLinks();
      },
    });

    this.addCommand({
      id: 'limps:check-obsidian-mcp',
      name: 'Local Intelligence: Check Obsidian MCP',
      callback: async () => {
        await this.checkObsidianMcp();
      },
    });

    this.addCommand({
      id: 'limps:audit-obsidian-surfaces',
      name: 'Local Intelligence: Audit Obsidian Surfaces (.md/.canvas/.base)',
      callback: async () => {
        await this.auditObsidianSurfaces();
      },
    });

    this.addCommand({
      id: 'limps:use-repo-binary',
      name: 'Local Intelligence: Use Repo Binary Path',
      callback: async () => {
        const result = await this.useRepoBinaryPath();
        if (!result.ok) {
          new Notice(result.message, 9000);
          return;
        }

        new Notice(`limps binary path set to ${result.path}`, 7000);
      },
    });

    this.addCommand({
      id: 'limps:open-plugin-settings',
      name: 'Local Intelligence: Open Plugin Settings',
      callback: async () => {
        this.openPluginSettings();
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

    new Notice(`limps daemon is not running. Run: ${this.getDaemonStartCommand()}`, 9000);
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

  async auditObsidianSurfaces(): Promise<void> {
    try {
      const plansPath = this.getPlansPathFromConfig();
      const report = auditObsidianSurfaces(plansPath);
      const warnings = report.warnings.length > 0 ? `, warnings:${report.warnings.length}` : '';
      const empties =
        report.emptyCanvasFiles.length + report.emptyBaseFiles.length > 0
          ? `, empty surfaces:${report.emptyCanvasFiles.length + report.emptyBaseFiles.length}`
          : '';
      new Notice(
        `limps surface audit plans:${report.planDirectories} md:${report.markdownFiles} canvas:${report.canvasFiles} base:${report.baseFiles}${empties}${warnings}`,
        9000
      );
    } catch (error) {
      new Notice(`limps surface audit failed: ${String(error)}`, 9000);
    }
  }

  private async notifyIfDisconnected(): Promise<void> {
    if (this.disconnectedNoticeShown) return;

    const status = await getDaemonStatus(this.getRunOptions(true));
    if (status.ok && status.daemon?.running) return;

    this.disconnectedNoticeShown = true;
    new Notice(`limps daemon required. Run: ${this.getDaemonStartCommand()}`, 10000);
  }

  async openHealthView(): Promise<void> {
    const leaf = this.app.workspace.getRightLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE_HEALTH, active: true });
    await this.app.workspace.revealLeaf(leaf);
    await this.pollRuntimeStatus();
  }

  async openDirectedGraphView(): Promise<void> {
    const existingMainLeaf = this.getDirectedGraphLeafInEditorArea();
    if (existingMainLeaf) {
      await existingMainLeaf.setViewState({ type: VIEW_TYPE_DIRECTED_GRAPH, active: true });
      await this.app.workspace.revealLeaf(existingMainLeaf);
      await this.refreshDirectedGraphView();
      return;
    }

    const leaf = this.getEditorLeaf();
    await leaf.setViewState({ type: VIEW_TYPE_DIRECTED_GRAPH, active: true });
    await this.app.workspace.revealLeaf(leaf);
    await this.refreshDirectedGraphView();
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

  async refreshDirectedGraphView(forceOpen = false): Promise<void> {
    const view = this.getDirectedGraphView();
    if (!view) {
      if (!forceOpen) return;
      await this.openDirectedGraphView();
      return;
    }

    await view.refresh();
  }

  openPluginSettings(): void {
    const appWithSetting = this.app as unknown as {
      setting?: {
        open?: () => void;
        openTabById?: (id: string) => void;
      };
    };
    const pluginWithManifest = this as unknown as { manifest?: { id?: string } };
    const pluginId = pluginWithManifest.manifest?.id;

    appWithSetting.setting?.open?.();
    if (pluginId) {
      appWithSetting.setting?.openTabById?.(pluginId);
      return;
    }

    appWithSetting.setting?.openTabById?.('limps-obsidian-plugin');
  }

  async openFileAtLine(filePath: string, line?: number): Promise<void> {
    const workspace = this.app.workspace as {
      openLinkText?: (linkText: string, sourcePath: string, newLeaf?: boolean) => unknown;
      getMostRecentLeaf?: () => WorkspaceLeaf | null;
      activeLeaf?: WorkspaceLeaf | null;
    };
    const vaultPath = this.getVaultPath().replace(/\\/g, '/').replace(/\/+$/, '');
    const normalized = filePath.replace(/\\/g, '/');
    const relativePath = normalized.startsWith(`${vaultPath}/`)
      ? normalized.slice(vaultPath.length + 1)
      : normalized.replace(/^\/+/, '');

    if (workspace.openLinkText) {
      workspace.openLinkText(relativePath, '', false);
    }

    if (!line || line < 1) {
      return;
    }

    window.setTimeout(() => {
      const leaf = workspace.getMostRecentLeaf?.() ?? workspace.activeLeaf ?? null;
      const view = leaf?.view as unknown as {
        editor?: {
          setCursor?: (position: { line: number; ch: number }) => void;
          scrollIntoView?: (
            range: { from: { line: number; ch: number }; to: { line: number; ch: number } },
            center?: boolean
          ) => void;
          focus?: () => void;
        };
      };
      const editor = view?.editor;
      if (!editor?.setCursor) return;

      const targetLine = Math.max(0, line - 1);
      editor.setCursor({ line: targetLine, ch: 0 });
      editor.scrollIntoView?.(
        {
          from: { line: targetLine, ch: 0 },
          to: { line: targetLine, ch: 0 },
        },
        true
      );
      editor.focus?.();
    }, 40);
  }

  private getHealthView(): HealthView | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_HEALTH);
    if (leaves.length === 0) return null;

    const view = leaves[0].view;
    return view instanceof HealthView ? view : null;
  }

  private getDirectedGraphView(): DirectedGraphView | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIRECTED_GRAPH);
    if (leaves.length === 0) return null;

    const view = leaves[0].view;
    return view instanceof DirectedGraphView ? view : null;
  }

  private getDirectedGraphLeafInEditorArea(): WorkspaceLeaf | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIRECTED_GRAPH);
    const mainLeaf = leaves.find((leaf) => !this.isSidebarLeaf(leaf));
    return mainLeaf ?? null;
  }

  private getRunOptions(parseJson: boolean): LimpsRunOptions {
    const limpsPath = this.resolveConfiguredLimpsPath();

    return {
      limpsPath,
      configPath: this.settings.configPath,
      cwd: this.getVaultPath(),
      timeoutMs: this.settings.commandTimeoutMs,
      parseJson,
    };
  }

  getVaultPath(): string {
    const adapter = this.app.vault.adapter as { basePath?: string };
    return adapter.basePath ?? process.cwd();
  }

  getDaemonStartCommand(): string {
    const limpsPath = this.resolveConfiguredLimpsPath();
    const configPath = this.settings.configPath || DEFAULT_SETTINGS.configPath;
    const executable = limpsPath.toLowerCase().endsWith('.js')
      ? `node ${limpsPath}`
      : limpsPath;
    return `${executable} server start --config ${configPath}`;
  }

  getSuggestedRepoBinaryPath(): string {
    const configPath = this.settings.configPath || DEFAULT_SETTINGS.configPath;
    const repoRoot = dirname(dirname(configPath));
    return join(repoRoot, 'packages', 'limps', 'dist', 'cli.js');
  }

  async useRepoBinaryPath(): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
    const candidate = this.getSuggestedRepoBinaryPath();
    if (!existsSync(candidate)) {
      return {
        ok: false,
        message: `Repo limps binary not found at ${candidate}. Build package first (npm run build --workspace packages/limps).`,
      };
    }

    this.settings.useSystemLimpsBinary = false;
    this.settings.limpsPath = candidate;
    await this.saveSettings();
    return { ok: true, path: candidate };
  }

  getEffectiveBinaryPathPreview(): string {
    return this.resolveConfiguredLimpsPath();
  }

  private resolveConfiguredLimpsPath(): string {
    if (this.settings.useSystemLimpsBinary) {
      return 'limps';
    }

    const configured = this.settings.limpsPath?.trim() || DEFAULT_SETTINGS.limpsPath;
    return this.normalizeLimpsPath(configured);
  }

  private normalizeLimpsPath(path: string): string {
    if (!path || path === 'limps') {
      return path || 'limps';
    }

    try {
      if (!existsSync(path)) {
        return path;
      }

      const stat = statSync(path);
      if (!stat.isDirectory()) {
        return path;
      }

      const candidates = [
        join(path, 'dist', 'cli.js'),
        join(path, 'packages', 'limps', 'dist', 'cli.js'),
        join(path, 'cli.js'),
      ];

      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    } catch {
      return path;
    }

    return path;
  }

  getPlansPathFromConfig(): string {
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

  private registerContextMenuHooks(): void {
    const workspace = this.app.workspace as {
      on?: (eventName: string, callback: (...args: unknown[]) => unknown) => unknown;
    };
    if (!workspace.on || typeof workspace.on !== 'function') return;

    const eventRef = workspace.on('file-menu', (menu: unknown, file: unknown) => {
      const menuApi = menu as {
        addItem?: (build: (item: { setTitle: (title: string) => unknown; setIcon?: (icon: string) => unknown; onClick: (cb: () => void) => unknown }) => void) => void;
      };
      const filePath = (file as { path?: string } | null)?.path;
      if (!menuApi.addItem || typeof filePath !== 'string') return;

      menuApi.addItem((item) => {
        item.setTitle('Open Local Intelligence Graph');
        if (typeof item.setIcon === 'function') {
          item.setIcon('network');
        }
        item.onClick(() => {
          void this.openDirectedGraphView();
        });
      });
    });

    if (eventRef && typeof this.registerEvent === 'function') {
      this.registerEvent(eventRef);
    }
  }

  private getEditorLeaf(): WorkspaceLeaf {
    const workspace = this.app.workspace as {
      activeLeaf?: WorkspaceLeaf | null;
      getLeaf?: (newLeaf?: boolean | 'tab' | 'split') => WorkspaceLeaf;
      getMostRecentLeaf?: () => WorkspaceLeaf | null;
      getRightLeaf: (split: boolean) => WorkspaceLeaf;
    };

    const activeLeaf = workspace.activeLeaf ?? null;
    if (activeLeaf && !this.isSidebarLeaf(activeLeaf)) {
      return activeLeaf;
    }

    const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
    if (markdownLeaves.length > 0) {
      const inMainArea = markdownLeaves.filter((leaf) => !this.isSidebarLeaf(leaf));
      const candidates = inMainArea.length > 0 ? inMainArea : markdownLeaves;
      return this.pickWidestLeaf(candidates);
    }

    const recentLeaf = workspace.getMostRecentLeaf?.() ?? null;
    if (recentLeaf && !this.isSidebarLeaf(recentLeaf)) {
      return recentLeaf;
    }

    if (typeof workspace.getLeaf === 'function') {
      return workspace.getLeaf('tab');
    }

    return workspace.getRightLeaf(false);
  }

  private pickWidestLeaf(leaves: WorkspaceLeaf[]): WorkspaceLeaf {
    return leaves.reduce((widest, current) => {
      const widestWidth = this.readLeafWidth(widest);
      const currentWidth = this.readLeafWidth(current);
      return currentWidth > widestWidth ? current : widest;
    }, leaves[0] as WorkspaceLeaf);
  }

  private readLeafWidth(leaf: WorkspaceLeaf): number {
    const maybeContainer = (leaf as unknown as { containerEl?: HTMLElement }).containerEl;
    if (!maybeContainer) return 0;
    return maybeContainer.getBoundingClientRect().width;
  }

  private isSidebarLeaf(leaf: WorkspaceLeaf): boolean {
    const root =
      (leaf as unknown as { getRoot?: () => { id?: string; type?: string } | null }).getRoot?.() ??
      null;
    const parent = (leaf as unknown as { parent?: { id?: string; type?: string; root?: { id?: string; type?: string } } }).parent;

    const rootId = String(root?.id ?? root?.type ?? parent?.root?.id ?? parent?.id ?? parent?.type ?? '').toLowerCase();
    if (!rootId) return false;

    return rootId.includes('left') || rootId.includes('right') || rootId.includes('sidebar');
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
      this.statusBarEl.title = 'local intelligence runtime governance status';
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

    const directedLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIRECTED_GRAPH);
    for (const leaf of directedLeaves) {
      void leaf.setViewState({ type: 'empty' });
    }
  }
}
