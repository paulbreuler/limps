import { createElement } from "react";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ItemView, WorkspaceLeaf } from "obsidian";
import type { HealthSnapshot } from "../main.js";
import { VIEW_TYPE_HEALTH } from "../main.js";
import type LimpsPlugin from "../main.js";
import { LIMPS_HUB_ICON } from "../icons.js";
import { AppContext } from "../react/app-context.js";
import { HealthReactView } from "./HealthReactView.js";
import type { ActionId } from "./health/types.js";

export class HealthView extends ItemView {
  private readonly plugin: LimpsPlugin;
  private snapshot: HealthSnapshot = { state: "loading" };
  private actionInFlight = false;
  private root: Root | null = null;

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
    this.containerEl.innerHTML = "";
    this.root = createRoot(this.containerEl);
    this.render();
    await this.refresh(true);
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
    this.snapshot = { state: "loading" };
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

  private render(): void {
    if (!this.root) return;

    this.root.render(
      createElement(
        StrictMode,
        null,
        createElement(
          AppContext.Provider,
          { value: this.app },
          createElement(HealthReactView, {
            snapshot: this.snapshot,
            actionInFlight: this.actionInFlight,
            daemonStartCommand: this.plugin.getDaemonStartCommand(),
            notifications: this.plugin.getNotificationLog(),
            onAction: (action: ActionId) => {
              void this.handleAction(action);
            },
          }),
        ),
      ),
    );
  }

  private async handleAction(action: ActionId): Promise<void> {
    const actionMap: Record<ActionId, () => Promise<void>> = {
      "refresh-health": async () => {
        await this.refresh();
      },
      "check-daemon": async () => {
        await this.plugin.checkDaemonStatus();
        await this.refresh();
      },
      "graph-reindex": async () => {
        await this.plugin.graphReindex();
      },
      "convert-deps": async () => {
        await this.plugin.convertDependenciesToPaths();
      },
      "clear-notifications": async () => {
        this.plugin.clearNotificationLog();
        this.render();
      },
    };

    await this.runAction(actionMap[action]);
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
