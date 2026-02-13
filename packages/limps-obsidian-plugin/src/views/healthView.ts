import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { HealthSnapshot } from '../main.js';
import { VIEW_TYPE_HEALTH } from '../main.js';
import type LimpsPlugin from '../main.js';

export class HealthView extends ItemView {
  private readonly plugin: LimpsPlugin;
  private snapshot: HealthSnapshot = { state: 'loading' };
  private actionInFlight = false;
  private rootEl: HTMLDivElement | null = null;
  private statusEl: HTMLDivElement | null = null;
  private nextCheckEl: HTMLDivElement | null = null;
  private cardsEl: HTMLDivElement | null = null;
  private nextCheckAt: number | null = null;
  private countdownIntervalId: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: LimpsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_HEALTH;
  }

  getDisplayText(): string {
    return 'limps Health';
  }

  async onOpen(): Promise<void> {
    this.ensureLayout();
    this.startCountdown();
    this.render();
    await this.refresh(true);
  }

  async onClose(): Promise<void> {
    this.snapshot = { state: 'loading' };
    this.nextCheckAt = null;
    if (this.countdownIntervalId !== null) {
      window.clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = null;
    }
  }

  async refresh(showLoading = false): Promise<void> {
    if (showLoading) {
      this.snapshot = { state: 'loading' };
      this.render();
    }

    this.snapshot = await this.plugin.getHealthSnapshot();
    this.nextCheckAt = Date.now() + Math.max(2000, this.plugin.settings.healthRefreshMs);
    this.render();
  }

  private renderStatusLine(): string {
    const state = this.snapshot.state;
    if (state === 'loading') return 'Loading limps health...';
    if (state === 'disconnected') return 'Disconnected: limps daemon is not running';
    if (state === 'error') return 'Error fetching limps health';
    if (state === 'healthy-empty') return 'Connected: graph index is empty';
    return 'Connected: limps health is available';
  }

  private renderCards(): string {
    const state = this.snapshot.state;
    const disabledAttr = this.actionInFlight || state === 'loading' ? 'disabled' : '';

    if (state === 'loading') {
      return '<div class="card">Waiting for limps command output...</div>';
    }

    if (state === 'disconnected') {
      return `
        <div class="card">
          <div>Start the daemon first:</div>
          <pre>limps server start --config /Users/paul/Documents/GitHub/limps/.limps/config.json</pre>
          <div class="actions">
            <button type="button" data-action="check-daemon" ${disabledAttr}>Check daemon status</button>
          </div>
        </div>
      `;
    }

    if (state === 'error') {
      return `
        <div class="card">
          <div>${this.snapshot.message ?? 'Unknown error'}</div>
          <div class="actions">
            <button type="button" class="mod-cta" data-action="refresh-health" ${disabledAttr}>Refresh health</button>
          </div>
        </div>
      `;
    }

    const summary = this.snapshot.health?.summary;
    const totalEntities = summary?.totalEntities ?? 0;
    const totalRelations = summary?.totalRelations ?? 0;
    const conflictCount = summary?.conflictCount ?? 0;
    const warningCount = summary?.warningCount ?? 0;
    const errorCount = summary?.errorCount ?? 0;
    const lastIndexed = summary?.lastIndexed || 'Never';

    const emptyHint =
      state === 'healthy-empty'
        ? `<div class="card">
            <div>Graph has no entities yet.</div>
            <div class="actions">
              <button type="button" class="mod-cta" data-action="graph-reindex" ${disabledAttr}>Run graph reindex</button>
            </div>
          </div>`
        : '';

    const graphLinksHint =
      `<div class="card">
        <div>Project LIMPS relationships into Obsidian Graph.</div>
        <div class="actions">
          <button type="button" class="mod-cta" data-action="sync-links" ${disabledAttr}>Sync Obsidian Graph</button>
          <button type="button" data-action="audit-surfaces" ${disabledAttr}>Audit surfaces</button>
        </div>
      </div>`;

    const mcpHint = this.plugin.settings.enableObsidianMcp
      ? `<div class="card">
          <div>Validate Obsidian MCP connectivity for AI-governed workflows.</div>
          <div class="actions">
            <button type="button" data-action="check-obsidian-mcp" ${disabledAttr}>Check Obsidian MCP</button>
          </div>
        </div>`
      : '';

    return `
      <div class="card actions-row">
        <button type="button" data-action="refresh-health" ${disabledAttr}>Refresh</button>
        <button type="button" data-action="check-daemon" ${disabledAttr}>Check daemon</button>
        <button type="button" data-action="convert-deps" ${disabledAttr}>Convert deps</button>
      </div>
      <div class="card">
        <div><strong>Entities:</strong> ${totalEntities}</div>
        <div><strong>Relations:</strong> ${totalRelations}</div>
      </div>
      <div class="card">
        <div><strong>Conflicts:</strong> ${conflictCount}</div>
        <div><strong>Warnings:</strong> ${warningCount}</div>
        <div><strong>Errors:</strong> ${errorCount}</div>
      </div>
      <div class="card meta">
        <div><strong>Last indexed:</strong> ${lastIndexed}</div>
      </div>
      ${emptyHint}
      ${graphLinksHint}
      ${mcpHint}
    `;
  }

  private render(): void {
    this.ensureLayout();

    const stateClass =
      this.snapshot.state === 'healthy' || this.snapshot.state === 'healthy-empty'
        ? 'healthy'
        : this.snapshot.state;

    if (this.statusEl) {
      this.statusEl.className = `status ${stateClass}`;
      this.statusEl.textContent = this.renderStatusLine();
    }

    this.updateNextCheckLine();

    if (this.cardsEl) {
      this.cardsEl.innerHTML = this.renderCards();
      this.bindActions();
    }
  }

  private ensureLayout(): void {
    if (this.rootEl && this.statusEl && this.cardsEl && this.nextCheckEl) {
      return;
    }

    this.containerEl.innerHTML = '';

    const root = document.createElement('div');
    root.className = 'limps-health-view';

    const heading = document.createElement('h3');
    heading.textContent = 'limps Health';

    const status = document.createElement('div');
    status.className = 'status loading';

    const nextCheck = document.createElement('div');
    nextCheck.className = 'next-check';

    const cards = document.createElement('div');
    cards.className = 'cards';

    root.appendChild(heading);
    root.appendChild(status);
    root.appendChild(nextCheck);
    root.appendChild(cards);
    this.containerEl.appendChild(root);

    this.rootEl = root;
    this.statusEl = status;
    this.nextCheckEl = nextCheck;
    this.cardsEl = cards;
  }

  private startCountdown(): void {
    if (this.countdownIntervalId !== null) {
      window.clearInterval(this.countdownIntervalId);
    }

    this.countdownIntervalId = window.setInterval(() => {
      this.updateNextCheckLine();
    }, 1000);
  }

  private updateNextCheckLine(): void {
    if (!this.nextCheckEl) return;
    if (!this.nextCheckAt) {
      this.nextCheckEl.textContent = 'Next check: pending';
      return;
    }

    const seconds = Math.max(0, Math.ceil((this.nextCheckAt - Date.now()) / 1000));
    this.nextCheckEl.textContent =
      seconds === 0 ? 'Next check: now' : `Next check in ${seconds}s`;
  }

  private bindActions(): void {
    this.bindAction('refresh-health', async () => {
      await this.refresh();
    });
    this.bindAction('check-daemon', async () => {
      await this.plugin.checkDaemonStatus();
      await this.refresh();
    });
    this.bindAction('graph-reindex', async () => {
      await this.plugin.graphReindex();
    });
    this.bindAction('sync-links', async () => {
      await this.plugin.syncObsidianGraphLinks();
    });
    this.bindAction('convert-deps', async () => {
      await this.plugin.convertDependenciesToPaths();
    });
    this.bindAction('audit-surfaces', async () => {
      await this.plugin.auditObsidianSurfaces();
    });
    this.bindAction('check-obsidian-mcp', async () => {
      await this.plugin.checkObsidianMcp();
    });
  }

  private bindAction(action: string, run: () => Promise<void>): void {
    const button = this.containerEl.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
    if (!button) return;

    button.addEventListener('click', () => {
      void this.runAction(run);
    });
  }

  private async runAction(run: () => Promise<void>): Promise<void> {
    if (this.actionInFlight) return;
    this.actionInFlight = true;
    this.render();
    try {
      await run();
    } finally {
      this.actionInFlight = false;
      this.render();
    }
  }
}
