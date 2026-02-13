import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import { relative } from 'node:path';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { buildDirectedGraph } from '../graph/directedGraph.js';
import type { DirectedGraphData, DirectedGraphNode } from '../graph/directedGraph.js';
import type LimpsPlugin from '../main.js';
import { VIEW_TYPE_DIRECTED_GRAPH } from '../main.js';

cytoscape.use(dagre as unknown as cytoscape.Ext);

const EDGE_LABELS: Record<string, string> = {
  'plan-contains': 'contains',
  'depends-on': 'depends_on',
  blocks: 'blocks',
  'related-doc': 'related_doc',
  'related-canvas': 'related_canvas',
  'related-base': 'related_base',
};

export class DirectedGraphView extends ItemView {
  private readonly plugin: LimpsPlugin;
  private graph: DirectedGraphData | null = null;
  private rootEl: HTMLDivElement | null = null;
  private summaryEl: HTMLDivElement | null = null;
  private warningEl: HTMLDivElement | null = null;
  private graphEl: HTMLDivElement | null = null;
  private actionInFlight = false;
  private cy: cytoscape.Core | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: LimpsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_DIRECTED_GRAPH;
  }

  getDisplayText(): string {
    return 'limps Directed Graph';
  }

  async onOpen(): Promise<void> {
    this.ensureLayout();
    this.render();
    await this.refresh();
  }

  async onClose(): Promise<void> {
    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }
  }

  async refresh(): Promise<void> {
    try {
      const plansPath = this.plugin.getPlansPathFromConfig();
      this.graph = buildDirectedGraph(plansPath);
      this.render();
    } catch (error) {
      this.graph = null;
      if (this.summaryEl) {
        this.summaryEl.textContent = `Failed to build graph: ${String(error)}`;
        this.summaryEl.className = 'summary error';
      }
      if (this.warningEl) {
        this.warningEl.innerHTML = '';
      }
      if (this.graphEl) {
        this.graphEl.innerHTML = '';
      }
    }
  }

  private ensureLayout(): void {
    if (this.rootEl && this.summaryEl && this.warningEl && this.graphEl) {
      return;
    }

    this.containerEl.innerHTML = '';

    const root = document.createElement('div');
    root.className = 'limps-directed-graph-view';

    const heading = document.createElement('h3');
    heading.textContent = 'limps Directed Graph';

    const summary = document.createElement('div');
    summary.className = 'summary loading';
    summary.textContent = 'Loading LIMPS directed relationships...';

    const actions = document.createElement('div');
    actions.className = 'actions';

    const refreshButton = document.createElement('button');
    refreshButton.type = 'button';
    refreshButton.textContent = 'Refresh';
    refreshButton.dataset.action = 'refresh';

    const syncButton = document.createElement('button');
    syncButton.type = 'button';
    syncButton.className = 'mod-cta';
    syncButton.textContent = 'Sync Obsidian Graph';
    syncButton.dataset.action = 'sync';

    actions.appendChild(refreshButton);
    actions.appendChild(syncButton);

    const warning = document.createElement('div');
    warning.className = 'warnings';

    const graph = document.createElement('div');
    graph.className = 'graph-scroll';

    root.appendChild(heading);
    root.appendChild(summary);
    root.appendChild(actions);
    root.appendChild(warning);
    root.appendChild(graph);

    this.containerEl.appendChild(root);

    this.rootEl = root;
    this.summaryEl = summary;
    this.warningEl = warning;
    this.graphEl = graph;

    this.bindActions();
  }

  private bindActions(): void {
    const refreshButton = this.rootEl?.querySelector<HTMLButtonElement>('button[data-action="refresh"]');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        void this.runAction(async () => {
          await this.refresh();
        });
      });
    }

    const syncButton = this.rootEl?.querySelector<HTMLButtonElement>('button[data-action="sync"]');
    if (syncButton) {
      syncButton.addEventListener('click', () => {
        void this.runAction(async () => {
          await this.plugin.syncObsidianGraphLinks();
          await this.refresh();
        });
      });
    }
  }

  private async runAction(run: () => Promise<void>): Promise<void> {
    if (this.actionInFlight) return;
    this.actionInFlight = true;
    this.toggleActionButtons(true);
    try {
      await run();
    } finally {
      this.actionInFlight = false;
      this.toggleActionButtons(false);
    }
  }

  private toggleActionButtons(disabled: boolean): void {
    const buttons = this.rootEl?.querySelectorAll<HTMLButtonElement>('button[data-action]') ?? [];
    buttons.forEach((button) => {
      button.disabled = disabled;
    });
  }

  private render(): void {
    this.ensureLayout();

    if (!this.summaryEl || !this.warningEl || !this.graphEl) return;

    if (!this.graph) {
      this.summaryEl.textContent = 'No graph data available.';
      this.summaryEl.className = 'summary error';
      this.warningEl.innerHTML = '';
      this.graphEl.innerHTML = '';
      return;
    }

    this.summaryEl.className = this.graph.cycles.length > 0 ? 'summary warning' : 'summary healthy';
    this.summaryEl.textContent = [
      `Plans: ${this.graph.stats.plans}`,
      `Agents: ${this.graph.stats.agents}`,
      `Edges: ${this.graph.stats.edges}`,
      `Cycles: ${this.graph.cycles.length}`,
      `Isolated agents: ${this.graph.stats.isolatedAgents}`,
    ].join(' | ');

    const warningLines: string[] = [];
    if (this.graph.cycles.length > 0) {
      const cyclePreview = this.graph.cycles
        .slice(0, 3)
        .map((cycle) => cycle.labels.join(' -> '))
        .join(' | ');
      warningLines.push(`Dependency cycles detected: ${this.graph.cycles.length}`);
      warningLines.push(cyclePreview);
    }
    if (this.graph.warnings.length > 0) {
      warningLines.push(...this.graph.warnings.slice(0, 6));
      if (this.graph.warnings.length > 6) {
        warningLines.push(`...and ${this.graph.warnings.length - 6} more warnings`);
      }
    }

    if (warningLines.length > 0) {
      this.warningEl.textContent = warningLines.join('\n');
      this.warningEl.style.display = 'block';
    } else {
      this.warningEl.textContent = '';
      this.warningEl.style.display = 'none';
    }

    this.renderCytoscape(this.graph);
  }

  private renderCytoscape(graph: DirectedGraphData): void {
    if (!this.graphEl) return;

    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }

    this.graphEl.innerHTML = '';
    const mount = document.createElement('div');
    mount.className = 'graph-canvas-host';
    this.graphEl.appendChild(mount);

    const elements: cytoscape.ElementDefinition[] = [];
    for (const node of graph.nodes) {
      elements.push({
        group: 'nodes',
        data: {
          id: node.id,
          label: node.label,
          type: node.type,
          filePath: node.filePath,
          planId: node.planId,
        },
        classes: `node-${node.type}`,
      });
    }

    for (const edge of graph.edges) {
      elements.push({
        group: 'edges',
        data: {
          id: `${edge.from}->${edge.to}:${edge.type}`,
          source: edge.from,
          target: edge.to,
          type: edge.type,
          edgeLabel: EDGE_LABELS[edge.type] ?? edge.type,
        },
        classes: `edge-${edge.type}`,
      });
    }

    this.cy = cytoscape({
      container: mount,
      elements,
      wheelSensitivity: 0.2,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            color: '#0f172a',
            'font-size': 9,
            'text-wrap': 'ellipsis',
            'text-max-width': '120px',
            'text-valign': 'center',
            'text-halign': 'center',
            width: 22,
            height: 22,
            'border-width': 1.5,
            'background-color': '#e2e8f0',
            'border-color': '#475569',
          },
        },
        {
          selector: '.node-plan',
          style: {
            shape: 'round-rectangle',
            width: 120,
            height: 28,
            'background-color': '#e0f2fe',
            'border-color': '#0c4a6e',
            'font-size': 10,
            'font-weight': 700,
          },
        },
        {
          selector: '.node-agent',
          style: {
            shape: 'ellipse',
            width: 20,
            height: 20,
            'background-color': '#ede9fe',
            'border-color': '#5b21b6',
            'font-size': 8,
            'text-valign': 'top',
            'text-margin-y': -10,
          },
        },
        {
          selector: '.node-doc',
          style: {
            shape: 'round-rectangle',
            width: 60,
            height: 20,
            'background-color': '#dcfce7',
            'border-color': '#166534',
            'font-size': 8,
          },
        },
        {
          selector: '.node-canvas',
          style: {
            shape: 'round-rectangle',
            width: 60,
            height: 20,
            'background-color': '#fef3c7',
            'border-color': '#92400e',
            'font-size': 8,
          },
        },
        {
          selector: '.node-base',
          style: {
            shape: 'round-rectangle',
            width: 60,
            height: 20,
            'background-color': '#fee2e2',
            'border-color': '#991b1b',
            'font-size': 8,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.6,
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'target-arrow-color': '#64748b',
            'line-color': '#94a3b8',
            'arrow-scale': 0.7,
            'font-size': 7,
            color: '#334155',
            'text-rotation': 'autorotate',
            'text-background-opacity': 1,
            'text-background-color': '#ffffff',
            'text-background-padding': '2px',
            label: 'data(edgeLabel)',
          },
        },
        { selector: '.edge-plan-contains', style: { 'line-color': '#2563eb', 'target-arrow-color': '#2563eb' } },
        { selector: '.edge-depends-on', style: { 'line-color': '#dc2626', 'target-arrow-color': '#dc2626' } },
        { selector: '.edge-blocks', style: { 'line-color': '#ea580c', 'target-arrow-color': '#ea580c' } },
        { selector: '.edge-related-doc', style: { 'line-color': '#14b8a6', 'target-arrow-color': '#14b8a6' } },
        { selector: '.edge-related-canvas', style: { 'line-color': '#7c3aed', 'target-arrow-color': '#7c3aed' } },
        { selector: '.edge-related-base', style: { 'line-color': '#0f766e', 'target-arrow-color': '#0f766e' } },
      ],
      layout: {
        name: 'dagre',
        rankDir: 'LR',
        nodeSep: 20,
        rankSep: 120,
        edgeSep: 8,
        fit: true,
        padding: 20,
        spacingFactor: 1.1,
      } as cytoscape.LayoutOptions,
    });

    this.cy.on('tap', 'node', (event) => {
      const data = event.target.data() as { filePath?: string; type?: string; label?: string };
      if (!data.filePath) {
        return;
      }
      const node: DirectedGraphNode = {
        id: String(event.target.id()),
        label: data.label ?? String(event.target.id()),
        type: (data.type as DirectedGraphNode['type']) ?? 'doc',
        filePath: data.filePath,
        planId: String(event.target.data('planId') ?? ''),
      };
      this.openNodeFile(node, data.filePath);
    });

    this.cy.on('tap', 'edge', (event) => {
      const edgeType = String(event.target.data('type') ?? 'edge');
      const source = String(event.target.data('source') ?? '');
      const target = String(event.target.data('target') ?? '');
      new Notice(`${edgeType}: ${source} -> ${target}`, 2500);
    });

    this.cy.fit();
  }

  private openNodeFile(node: DirectedGraphNode, filePath: string): void {
    const vaultPath = this.plugin.getVaultPath();
    const relativePath = relative(vaultPath, filePath).replace(/\\/g, '/');

    const workspace = this.app.workspace as {
      openLinkText?: (linkText: string, sourcePath: string, newLeaf?: boolean) => unknown;
    };

    if (workspace.openLinkText) {
      workspace.openLinkText(relativePath, '', false);
      return;
    }

    new Notice(`Selected ${node.type}: ${relativePath}`, 4000);
  }
}
