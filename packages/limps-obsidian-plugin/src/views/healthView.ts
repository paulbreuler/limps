import { ItemView, WorkspaceLeaf } from "obsidian";
import type { HealthSnapshot } from "../main.js";
import { VIEW_TYPE_HEALTH } from "../main.js";
import type LimpsPlugin from "../main.js";
import { LIMPS_HUB_ICON } from "../icons.js";

export class HealthView extends ItemView {
  private readonly plugin: LimpsPlugin;
  private snapshot: HealthSnapshot = { state: "loading" };
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
    return "Local Intelligence";
  }

  getIcon(): string {
    return LIMPS_HUB_ICON;
  }

  async onOpen(): Promise<void> {
    this.ensureLayout();
    this.startCountdown();
    this.render();
    await this.refresh(true);
  }

  async onClose(): Promise<void> {
    this.snapshot = { state: "loading" };
    this.nextCheckAt = null;
    if (this.countdownIntervalId !== null) {
      window.clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = null;
    }
  }

  async refresh(showLoading = false): Promise<void> {
    if (showLoading) {
      this.snapshot = { state: "loading" };
      this.render();
    }

    // Preserve existing intelligence data to avoid UI flickering
    const currentIntel = {
      documentCount: this.snapshot.documentCount,
      plans: this.snapshot.plans,
      conflicts: this.snapshot.conflicts,
      healthCheck: this.snapshot.healthCheck,
    };

    // Fast path: daemon status + graph summary
    const basicSnapshot = await this.plugin.getHealthSnapshot();

    // Only preserve intel if we are still healthy
    if (
      basicSnapshot.state === "healthy" ||
      basicSnapshot.state === "healthy-empty"
    ) {
      this.snapshot = { ...basicSnapshot, ...currentIntel };
    } else {
      this.snapshot = basicSnapshot;
    }

    this.nextCheckAt =
      Date.now() + Math.max(2000, this.plugin.settings.healthRefreshMs);
    this.render();

    // Slow path: intelligence data (plans, docs, conflicts, health check)
    // Only fetch when daemon is connected
    if (
      this.snapshot.state === "healthy" ||
      this.snapshot.state === "healthy-empty"
    ) {
      const intel = await this.plugin.getIntelligenceData();
      this.snapshot = { ...this.snapshot, ...intel };
      this.render();
    }
  }

  private renderStatusLine(): string {
    const state = this.snapshot.state;
    if (state === "loading") return "Loading local intelligence status...";
    if (state === "disconnected")
      return "Disconnected: local intelligence daemon is not running";
    if (state === "error") return "Error fetching local intelligence status";
    if (state === "healthy-empty") return "Connected: graph index is empty";
    return "Connected: local intelligence is available";
  }

  private renderCards(): string {
    const state = this.snapshot.state;
    const disabledAttr =
      this.actionInFlight || state === "loading" ? "disabled" : "";
    const errorMessage = this.escapeHtml(
      this.snapshot.message ?? "Unknown error",
    );

    if (state === "loading") {
      return '<div class="card">Waiting for limps command output...</div>';
    }

    if (state === "disconnected") {
      return `
        <div class="card">
          <div>Start the daemon first:</div>
          <pre>${this.plugin.getDaemonStartCommand()}</pre>
          <div class="actions">
            <button type="button" data-action="check-daemon" ${disabledAttr}>Check daemon status</button>
          </div>
        </div>
      `;
    }

    if (state === "error") {
      return `
        <div class="card">
          <pre class="error-details">${errorMessage}</pre>
          <div class="actions">
            <button type="button" class="mod-cta" data-action="refresh-health" ${disabledAttr}>Refresh health</button>
          </div>
        </div>
      `;
    }

    const summary = this.snapshot.health?.summary;
    const totalEntities = summary?.totalEntities ?? 0;
    const totalRelations = summary?.totalRelations ?? 0;
    const lastIndexed = summary?.lastIndexed || "Never";
    const documentCount = this.snapshot.documentCount;
    const plans = this.snapshot.plans ?? [];
    const conflicts = this.snapshot.conflicts ?? [];
    const healthCheck = this.snapshot.healthCheck;

    const emptyHint =
      state === "healthy-empty"
        ? `<div class="card card-warning">
            <div class="card-title">Graph Empty</div>
            <div>Graph has no entities yet. Run a reindex to populate.</div>
            <div class="actions">
              <button type="button" class="mod-cta" data-action="graph-reindex" ${disabledAttr}>Reindex now</button>
            </div>
          </div>`
        : "";

    return `
      <div class="card actions-row">
        <button type="button" data-action="refresh-health" ${disabledAttr}>Refresh</button>
        <button type="button" data-action="check-daemon" ${disabledAttr}>Check daemon</button>
        <button type="button" data-action="graph-reindex" ${disabledAttr}>Reindex</button>
        <button type="button" data-action="convert-deps" ${disabledAttr}>Convert deps</button>
      </div>
      ${this.renderOverviewCard(totalEntities, totalRelations, documentCount, plans.length, lastIndexed)}
      ${emptyHint}
      ${this.renderPlanStatusCards(plans, disabledAttr)}
      ${this.renderIssuesCard(conflicts, healthCheck)}
      ${this.renderGraphLinksCard(disabledAttr)}
      ${this.renderMcpSessionCard(disabledAttr)}
      ${this.renderMcpCheckCard(disabledAttr)}
      ${this.renderNotificationLog()}
    `;
  }

  private renderOverviewCard(
    totalEntities: number,
    totalRelations: number,
    documentCount: number | undefined,
    planCount: number,
    lastIndexed: string,
  ): string {
    const docLine =
      documentCount !== undefined
        ? `<div class="overview-stat"><span class="overview-label">Documents indexed</span><span class="overview-value">${documentCount.toLocaleString()}</span></div>`
        : "";

    return `<div class="card overview-card">
      <div class="card-title">Overview</div>
      ${docLine}
      <div class="overview-stat"><span class="overview-label">Plans</span><span class="overview-value">${planCount}</span></div>
      <div class="overview-stat"><span class="overview-label">Graph entities</span><span class="overview-value">${totalEntities}</span></div>
      <div class="overview-stat"><span class="overview-label">Graph relations</span><span class="overview-value">${totalRelations}</span></div>
      <div class="overview-stat meta"><span class="overview-label">Last indexed</span><span class="overview-value">${lastIndexed}</span></div>
    </div>`;
  }

  private renderPlanStatusCards(
    plans: HealthSnapshot["plans"],
    _disabledAttr: string,
  ): string {
    if (!plans || plans.length === 0) return "";

    const rows = plans
      .map((plan) => {
        const pct = Math.round(plan.completion);
        const barColor =
          pct === 100
            ? "var(--text-success)"
            : pct >= 50
              ? "var(--text-warning)"
              : "var(--text-error)";
        const statusBadge = this.renderStatusBadge(plan.status);
        const counts = plan.statusCounts;
        const breakdown = [
          counts.PASS > 0
            ? `<span class="agent-count pass">${counts.PASS} PASS</span>`
            : "",
          counts.WIP > 0
            ? `<span class="agent-count wip">${counts.WIP} WIP</span>`
            : "",
          counts.GAP > 0
            ? `<span class="agent-count gap">${counts.GAP} GAP</span>`
            : "",
          counts.BLOCKED > 0
            ? `<span class="agent-count blocked">${counts.BLOCKED} BLOCKED</span>`
            : "",
        ]
          .filter(Boolean)
          .join(" ");

        return `<div class="plan-row">
        <div class="plan-header">
          <span class="plan-name">${this.escapeHtml(plan.name)}</span>
          ${statusBadge}
        </div>
        <div class="plan-progress">
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%; background:${barColor}"></div></div>
          <span class="progress-pct">${pct}%</span>
        </div>
        <div class="plan-agents">${plan.agentCount} agents: ${breakdown}</div>
      </div>`;
      })
      .join("");

    return `<div class="card">
      <div class="card-title">Plan Status</div>
      ${rows}
    </div>`;
  }

  private renderStatusBadge(status: string): string {
    const lower = status.toLowerCase();
    return `<span class="status-badge status-${lower}">${this.escapeHtml(status)}</span>`;
  }

  private renderIssuesCard(
    conflicts: HealthSnapshot["conflicts"],
    healthCheck: HealthSnapshot["healthCheck"],
  ): string {
    const conflictList = conflicts ?? [];
    const staleCount = healthCheck?.staleCount ?? 0;
    const driftCount = healthCheck?.driftCount ?? 0;
    const inferenceSuggestions = healthCheck?.inferenceSuggestions ?? 0;

    const hasIssues =
      conflictList.length > 0 ||
      staleCount > 0 ||
      driftCount > 0 ||
      inferenceSuggestions > 0;
    if (!hasIssues) return "";

    let html =
      '<div class="card card-issues"><div class="card-title">Issues</div>';

    if (conflictList.length > 0) {
      html +=
        '<div class="issue-section"><div class="issue-section-title">Conflicts</div>';
      for (const conflict of conflictList) {
        const severityClass =
          conflict.severity === "error" ? "severity-error" : "severity-warning";
        html += `<div class="issue-item">
          <span class="issue-badge ${severityClass}">${this.escapeHtml(conflict.type)}</span>
          <span class="issue-message">${this.escapeHtml(conflict.message)}</span>
        </div>`;
      }
      html += "</div>";
    }

    if (staleCount > 0) {
      html += `<div class="issue-section">
        <div class="issue-item">
          <span class="issue-badge severity-warning">stale</span>
          <span class="issue-message">${staleCount} stale item${staleCount !== 1 ? "s" : ""} detected (agents/plans in WIP too long)</span>
        </div>
      </div>`;
    }

    if (driftCount > 0) {
      html += `<div class="issue-section">
        <div class="issue-item">
          <span class="issue-badge severity-warning">drift</span>
          <span class="issue-message">${driftCount} drift issue${driftCount !== 1 ? "s" : ""} (file references that don't match filesystem)</span>
        </div>
      </div>`;
    }

    if (inferenceSuggestions > 0) {
      html += `<div class="issue-section">
        <div class="issue-item">
          <span class="issue-badge severity-info">infer</span>
          <span class="issue-message">${inferenceSuggestions} status inference suggestion${inferenceSuggestions !== 1 ? "s" : ""} available</span>
        </div>
      </div>`;
    }

    html += "</div>";
    return html;
  }

  private renderGraphLinksCard(disabledAttr: string): string {
    return `<div class="card">
      <div class="card-title">Graph Actions</div>
      <div class="actions stacked">
        <button type="button" class="mod-cta" data-action="sync-links" ${disabledAttr}>Sync Obsidian Graph</button>
        <button type="button" data-action="open-directed-graph" ${disabledAttr}>Open Directed Graph (Editor)</button>
        <button type="button" data-action="audit-surfaces" ${disabledAttr}>Audit surfaces</button>
      </div>
    </div>`;
  }

  private renderMcpCheckCard(disabledAttr: string): string {
    if (!this.plugin.settings.enableObsidianMcp) return "";
    return `<div class="card">
      <div>Validate Obsidian MCP connectivity for AI-governed workflows.</div>
      <div class="actions">
        <button type="button" data-action="check-obsidian-mcp" ${disabledAttr}>Check Obsidian MCP</button>
      </div>
    </div>`;
  }

  private render(): void {
    this.ensureLayout();

    const stateClass =
      this.snapshot.state === "healthy" ||
      this.snapshot.state === "healthy-empty"
        ? "healthy"
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

    this.containerEl.innerHTML = "";

    const root = document.createElement("div");
    root.className = "limps-health-view";

    const heading = document.createElement("h3");
    heading.textContent = "Local Intelligence";

    const status = document.createElement("div");
    status.className = "status loading";

    const nextCheck = document.createElement("div");
    nextCheck.className = "next-check";

    const cards = document.createElement("div");
    cards.className = "cards";

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
      this.nextCheckEl.textContent = "Next check: pending";
      return;
    }

    const seconds = Math.max(
      0,
      Math.ceil((this.nextCheckAt - Date.now()) / 1000),
    );
    this.nextCheckEl.textContent =
      seconds === 0 ? "Next check: now" : `Next check in ${seconds}s`;
  }

  private bindActions(): void {
    this.bindAction("refresh-health", async () => {
      await this.refresh();
    });
    this.bindAction("check-daemon", async () => {
      await this.plugin.checkDaemonStatus();
      await this.refresh();
    });
    this.bindAction("graph-reindex", async () => {
      await this.plugin.graphReindex();
    });
    this.bindAction("sync-links", async () => {
      await this.plugin.syncObsidianGraphLinks();
    });
    this.bindAction("open-directed-graph", async () => {
      await this.plugin.openDirectedGraphView();
    });
    this.bindAction("convert-deps", async () => {
      await this.plugin.convertDependenciesToPaths();
    });
    this.bindAction("audit-surfaces", async () => {
      await this.plugin.auditObsidianSurfaces();
    });
    this.bindAction("check-obsidian-mcp", async () => {
      await this.plugin.checkObsidianMcp();
    });
    this.bindAction("clear-notifications", async () => {
      this.plugin.clearNotificationLog();
      this.render();
    });
    this.bindAction("mcp-reconnect", async () => {
      const client = this.plugin.getMcpClient();
      if (client) {
        await client.disconnect();
        await client.connect(this.plugin.settings.mcpEndpoint);
      }
      await this.refresh();
    });
  }

  private bindAction(action: string, run: () => Promise<void>): void {
    const button = this.containerEl.querySelector<HTMLButtonElement>(
      `button[data-action="${action}"]`,
    );
    if (!button) return;

    button.addEventListener("click", () => {
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

  private renderMcpSessionCard(disabledAttr: string): string {
    if (!this.plugin.settings.enablePersistentMcp) {
      return "";
    }

    const session = this.plugin.getMcpSessionInfo();
    const statusLabel =
      session.status === "connected"
        ? "Connected"
        : session.status === "reconnecting"
          ? "Reconnecting..."
          : "Disconnected";

    const sessionAge = session.connectedAt
      ? this.formatDuration(Date.now() - session.connectedAt)
      : "N/A";

    const lastKeepalive = session.lastKeepaliveAt
      ? this.formatDuration(Date.now() - session.lastKeepaliveAt) + " ago"
      : "N/A";

    const reconnectButton =
      session.status !== "connected"
        ? `<button type="button" class="mod-cta" data-action="mcp-reconnect" ${disabledAttr}>Reconnect</button>`
        : "";

    return `<div class="card">
      <div><strong>MCP Session:</strong> ${statusLabel}</div>
      <div><strong>Session age:</strong> ${sessionAge}</div>
      <div><strong>Last keepalive:</strong> ${lastKeepalive}</div>
      <div class="actions">
        ${reconnectButton}
      </div>
    </div>`;
  }

  private renderNotificationLog(): string {
    const log = this.plugin.getNotificationLog();
    if (log.length === 0) return "";

    const recent = log.slice(-10).reverse();
    const rows = recent
      .map((entry) => {
        const time = entry.timestamp.slice(11, 19);
        const badge =
          entry.severity === "error"
            ? "err"
            : entry.severity === "warning"
              ? "warn"
              : entry.severity === "success"
                ? "ok"
                : "info";
        return `<div class="log-entry"><span class="log-badge log-${entry.severity}">${badge}</span> <span class="log-time">${time}</span> ${this.escapeHtml(entry.message)}</div>`;
      })
      .join("");

    return `<div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>Notification Log</strong>
        <button type="button" data-action="clear-notifications" style="font-size:0.8em;">Clear</button>
      </div>
      <div class="log-entries" style="font-size:0.85em; margin-top:4px;">${rows}</div>
    </div>`;
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
