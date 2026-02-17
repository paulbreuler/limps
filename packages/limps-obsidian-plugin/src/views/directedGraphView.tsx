import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import type LimpsPlugin from '../main.js';
import { VIEW_TYPE_DIRECTED_GRAPH } from '../main.js';
import { AppContext } from '../react/app-context.js';
import { DirectedGraphReactView } from './DirectedGraphReactView.js';
import { LIMPS_GRAPH_ICON } from '../icons.js';

export class DirectedGraphView extends ItemView {
  private readonly plugin: LimpsPlugin;
  private root: Root | null = null;
  private renderEpoch = 0;

  constructor(leaf: WorkspaceLeaf, plugin: LimpsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_DIRECTED_GRAPH;
  }

  getDisplayText(): string {
    return 'Local Intelligence Graph';
  }

  getIcon(): string {
    return LIMPS_GRAPH_ICON;
  }

  async onOpen(): Promise<void> {
    this.containerEl.innerHTML = '';
    this.root = createRoot(this.containerEl);
    this.renderReactTree();
  }

  async refresh(): Promise<void> {
    this.renderEpoch += 1;
    this.renderReactTree();
  }

  private renderReactTree(): void {
    if (!this.root) return;
    this.root.render(
      <StrictMode>
        <AppContext.Provider value={this.app}>
          <DirectedGraphReactView key={`graph-${this.renderEpoch}`} plugin={this.plugin} />
        </AppContext.Provider>
      </StrictMode>
    );
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }
}
