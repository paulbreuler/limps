import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import type LimpsPlugin from '../main.js';
import { buildDirectedGraph } from '../graph/directedGraph.js';
import type { DirectedEdgeType, DirectedGraphData, DirectedGraphEdge, DirectedGraphNode } from '../graph/directedGraph.js';
import { useObsidianApp } from '../react/app-context.js';

interface DirectedGraphReactViewProps {
  plugin: LimpsPlugin;
}

type LayoutMode = 'physics' | 'flow';

interface ForceNode {
  id: string;
  label: string;
  type: DirectedGraphNode['type'];
  filePath: string;
  planId: string;
  val: number;
}

interface ForceLink {
  source: string;
  target: string;
  type: DirectedEdgeType;
  label: string;
  weight: number;
}

const EDGE_LABELS: Record<DirectedEdgeType, string> = {
  'plan-contains': 'contains',
  'depends-on': 'depends_on',
  'related-doc': 'related_doc',
  'related-canvas': 'related_canvas',
  'related-base': 'related_base',
  references: 'references',
  'semantic-tag': 'semantic',
};

const EDGE_WEIGHT: Record<DirectedEdgeType, number> = {
  'plan-contains': 1.1,
  'depends-on': 2.2,
  'related-doc': 0.9,
  'related-canvas': 0.9,
  'related-base': 0.9,
  references: 0.55,
  'semantic-tag': 0.45,
};

const NODE_COLOR: Record<DirectedGraphNode['type'], string> = {
  plan: '#60a5fa',
  agent: '#a78bfa',
  doc: '#34d399',
  roadmap: '#f472b6',
  canvas: '#fbbf24',
  base: '#f87171',
};

function nodeValue(type: DirectedGraphNode['type']): number {
  if (type === 'plan') return 8;
  if (type === 'roadmap') return 6;
  if (type === 'agent') return 4;
  return 2.5;
}

function shouldShowEdge(edge: DirectedGraphEdge, showReferences: boolean, showSemantic: boolean): boolean {
  if (edge.type === 'references') return showReferences;
  if (edge.type === 'semantic-tag') return showSemantic;
  return true;
}

function isReadableNode(node: ForceNode): boolean {
  return node.type === 'plan' || node.type === 'roadmap' || node.type === 'agent';
}

export function DirectedGraphReactView({ plugin }: DirectedGraphReactViewProps) {
  useObsidianApp();
  const [graph, setGraph] = useState<DirectedGraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('physics');
  const [showReferences, setShowReferences] = useState<boolean>(true);
  const [showSemantic, setShowSemantic] = useState<boolean>(true);

  const fgRef = useRef<ForceGraphMethods<ForceNode, ForceLink> | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const plansPath = plugin.getPlansPathFromConfig();
      const next = buildDirectedGraph(plansPath);
      setGraph(next);
    } catch (cause) {
      setGraph(null);
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  }, [plugin]);

  const syncAndReload = useCallback(async () => {
    await plugin.syncObsidianGraphLinks();
    await load();
  }, [load, plugin]);

  useEffect(() => {
    void load();
  }, [load]);

  const forceData = useMemo(() => {
    if (!graph) {
      return { nodes: [] as ForceNode[], links: [] as ForceLink[] };
    }

    const links = graph.edges
      .filter((edge) => shouldShowEdge(edge, showReferences, showSemantic))
      .map((edge) => ({
        source: edge.from,
        target: edge.to,
        type: edge.type,
        label: EDGE_LABELS[edge.type],
        weight: EDGE_WEIGHT[edge.type],
      }));

    const visibleNodeIds = new Set<string>();
    for (const link of links) {
      visibleNodeIds.add(link.source);
      visibleNodeIds.add(link.target);
    }

    const nodes = graph.nodes
      .filter((node) => visibleNodeIds.size === 0 || visibleNodeIds.has(node.id))
      .map((node) => ({
        id: node.id,
        label: node.label,
        type: node.type,
        filePath: node.filePath,
        planId: node.planId,
        val: nodeValue(node.type),
      }));

    return {
      nodes,
      links,
    };
  }, [graph, showReferences, showSemantic]);

  useEffect(() => {
    const graphApi = fgRef.current;
    if (!graphApi) return;

    const charge = graphApi.d3Force('charge');
    if (charge && typeof (charge as unknown as { strength?: (value: number) => unknown }).strength === 'function') {
      (charge as unknown as { strength: (value: number) => unknown }).strength(-180);
    }

    const linkForce = graphApi.d3Force('link');
    if (linkForce) {
      const linkApi = linkForce as unknown as {
        distance: (fn: (link: ForceLink) => number) => unknown;
        strength: (fn: (link: ForceLink) => number) => unknown;
      };
      linkApi.distance((link) => 120 - Math.min(70, link.weight * 24));
      linkApi.strength((link) => 0.08 + link.weight * 0.06);
    }
  }, [forceData]);

  const handleNodeClick = useCallback(
    (node: ForceNode) => {
      const vaultPath = plugin.getVaultPath();
      const relativePath = node.filePath.replace(vaultPath, '').replace(/^\/+/, '').replace(/\\/g, '/');
      const workspace = plugin.app.workspace as {
        openLinkText?: (linkText: string, sourcePath: string, newLeaf?: boolean) => unknown;
      };
      if (workspace.openLinkText) {
        workspace.openLinkText(relativePath, '', false);
      }
    },
    [plugin]
  );

  const warningText = useMemo(() => {
    if (!graph) return '';
    const lines: string[] = [];

    if (graph.cycles.length > 0) {
      lines.push(`Dependency cycles detected: ${graph.cycles.length}`);
      lines.push(...graph.cycles.slice(0, 3).map((cycle) => cycle.labels.join(' -> ')));
    }

    if (graph.warnings.length > 0) {
      lines.push(...graph.warnings.slice(0, 6));
      if (graph.warnings.length > 6) {
        lines.push(`...and ${graph.warnings.length - 6} more warnings`);
      }
    }

    return lines.join('\n');
  }, [graph]);

  const summary = graph
    ? [
        `Plans: ${graph.stats.plans}`,
        `Roadmap: ${graph.stats.roadmap}`,
        `Agents: ${graph.stats.agents}`,
        `Docs: ${graph.stats.docs}`,
        `Edges: ${graph.stats.edges}`,
        `Refs: ${graph.stats.referenceEdges}`,
        `Semantic: ${graph.stats.semanticEdges}`,
        `Cycles: ${graph.cycles.length}`,
      ].join(' | ')
    : loading
      ? 'Loading local intelligence graph...'
      : error
        ? `Graph error: ${error}`
        : 'No graph data available';

  return (
    <div className="limps-directed-graph-view">
      <h3>Local Intelligence Graph</h3>
      <div className={`summary ${error ? 'error' : graph && graph.cycles.length > 0 ? 'warning' : 'healthy'}`}>
        {summary}
      </div>

      <div className="actions">
        <button type="button" onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
        <button type="button" className="mod-cta" onClick={() => void syncAndReload()} disabled={loading}>
          Sync Obsidian Graph
        </button>
        <button
          type="button"
          onClick={() => setLayoutMode((current) => (current === 'physics' ? 'flow' : 'physics'))}
        >
          Layout: {layoutMode === 'physics' ? 'Physics' : 'Flow'}
        </button>
        <button type="button" onClick={() => setShowReferences((value) => !value)}>
          {showReferences ? 'Hide refs' : 'Show refs'}
        </button>
        <button type="button" onClick={() => setShowSemantic((value) => !value)}>
          {showSemantic ? 'Hide semantic' : 'Show semantic'}
        </button>
      </div>

      {warningText ? <div className="warnings">{warningText}</div> : null}

      <div className="graph-scroll">
        <div className="graph-canvas-host">
          <ForceGraph2D
            ref={fgRef}
            graphData={forceData}
            nodeRelSize={4.5}
            dagMode={layoutMode === 'flow' ? 'td' : undefined}
            dagLevelDistance={layoutMode === 'flow' ? 90 : undefined}
            d3AlphaDecay={layoutMode === 'physics' ? 0.014 : 0.04}
            d3VelocityDecay={layoutMode === 'physics' ? 0.25 : 0.45}
            warmupTicks={layoutMode === 'physics' ? 60 : 20}
            cooldownTicks={layoutMode === 'physics' ? 0 : 120}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            linkWidth={(link) => Math.max(0.8, link.weight)}
            linkColor={(link) => {
              if (link.type === 'depends-on') return '#dc2626';
              if (link.type === 'plan-contains') return '#2563eb';
              if (link.type === 'related-doc') return '#14b8a6';
              if (link.type === 'related-canvas') return '#7c3aed';
              if (link.type === 'related-base') return '#0f766e';
              if (link.type === 'references') return '#64748b';
              return '#f59e0b';
            }}
            onNodeClick={(node) => handleNodeClick(node as ForceNode)}
            onNodeDragEnd={(node) => {
              const dragged = node as { fx?: number; fy?: number; x?: number; y?: number };
              dragged.fx = dragged.x;
              dragged.fy = dragged.y;
              setTimeout(() => {
                dragged.fx = undefined;
                dragged.fy = undefined;
              }, 500);
            }}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const current = node as ForceNode;
              const color = NODE_COLOR[current.type] ?? '#64748b';
              const size = Math.max(2.5, (current.val ?? 2.5) * 1.3);

              ctx.beginPath();
              ctx.arc(node.x ?? 0, node.y ?? 0, size, 0, 2 * Math.PI, false);
              ctx.fillStyle = color;
              ctx.fill();

              if (isReadableNode(current) || globalScale > 1.8) {
                const fontSize = Math.max(8, 11 / globalScale);
                ctx.font = `${fontSize}px sans-serif`;
                ctx.fillStyle = '#0f172a';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(current.label, (node.x ?? 0) + size + 2, node.y ?? 0);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
