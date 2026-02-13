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
type LayerId = 'plan-structure' | 'dependencies' | 'plan-surfaces' | 'references' | 'semantic';

interface LayerOption {
  id: LayerId;
  label: string;
  description: string;
  edgeTypes: DirectedEdgeType[];
}

type LayerState = Record<LayerId, boolean>;

interface ForceNode {
  id: string;
  label: string;
  type: DirectedGraphNode['type'];
  filePath: string;
  planId: string;
  val: number;
  degree: number;
  mass: number;
}

interface ForceLink {
  source: string;
  target: string;
  type: DirectedEdgeType;
  label: string;
  weight: number;
}

interface ZoomTransform {
  k: number;
}

const LAYER_OPTIONS: LayerOption[] = [
  {
    id: 'plan-structure',
    label: 'Plan relationships',
    description: 'plan contains agent',
    edgeTypes: ['plan-contains'],
  },
  {
    id: 'dependencies',
    label: 'Dependencies',
    description: 'depends_on / blocks',
    edgeTypes: ['depends-on'],
  },
  {
    id: 'plan-surfaces',
    label: 'Plan docs',
    description: 'related docs/canvas/base',
    edgeTypes: ['related-doc', 'related-canvas', 'related-base'],
  },
  {
    id: 'references',
    label: 'References',
    description: 'markdown links',
    edgeTypes: ['references'],
  },
  {
    id: 'semantic',
    label: 'Semantic',
    description: 'shared tags',
    edgeTypes: ['semantic-tag'],
  },
];

const DEFAULT_LAYERS: LayerState = {
  'plan-structure': true,
  dependencies: true,
  'plan-surfaces': true,
  references: true,
  semantic: true,
};

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

function getEndpointDegree(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  const maybeDegree = (value as { degree?: unknown }).degree;
  return typeof maybeDegree === 'number' && Number.isFinite(maybeDegree) ? maybeDegree : 0;
}

function isEdgeEnabledByLayers(edgeType: DirectedEdgeType, layers: LayerState): boolean {
  return LAYER_OPTIONS.some((option) => layers[option.id] && option.edgeTypes.includes(edgeType));
}

function shouldShowEdge(edge: DirectedGraphEdge, layers: LayerState): boolean {
  return isEdgeEnabledByLayers(edge.type, layers);
}

function shouldRenderLabel(node: ForceNode, globalScale: number): boolean {
  if (globalScale < 1.1) {
    return false;
  }

  if (globalScale < 1.6) {
    return node.type === 'plan' || node.type === 'roadmap';
  }

  if (globalScale < 2.1) {
    return node.type === 'plan' || node.type === 'roadmap' || node.type === 'agent';
  }

  return true;
}

function truncateLabel(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

export function DirectedGraphReactView({ plugin }: DirectedGraphReactViewProps) {
  useObsidianApp();
  const [graph, setGraph] = useState<DirectedGraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('physics');
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);

  const fgRef = useRef<ForceGraphMethods<ForceNode, ForceLink> | undefined>(undefined);
  const zoomRef = useRef<number>(1);

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

  const layerCounts = useMemo(() => {
    const counts: Record<LayerId, number> = {
      'plan-structure': 0,
      dependencies: 0,
      'plan-surfaces': 0,
      references: 0,
      semantic: 0,
    };
    if (!graph) return counts;

    for (const edge of graph.edges) {
      for (const option of LAYER_OPTIONS) {
        if (option.edgeTypes.includes(edge.type)) {
          counts[option.id] += 1;
        }
      }
    }
    return counts;
  }, [graph]);

  const forceData = useMemo(() => {
    if (!graph) {
      return { nodes: [] as ForceNode[], links: [] as ForceLink[] };
    }

    const links = graph.edges
      .filter((edge) => shouldShowEdge(edge, layers))
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

    const degreeById = new Map<string, number>();
    for (const link of links) {
      degreeById.set(link.source, (degreeById.get(link.source) ?? 0) + 1);
      degreeById.set(link.target, (degreeById.get(link.target) ?? 0) + 1);
    }

    const nodes = graph.nodes
      .filter((node) => visibleNodeIds.size === 0 || visibleNodeIds.has(node.id))
      .map((node) => ({
        id: node.id,
        label: node.label,
        type: node.type,
        filePath: node.filePath,
        planId: node.planId,
        degree: degreeById.get(node.id) ?? 0,
        val: nodeValue(node.type) + Math.sqrt(degreeById.get(node.id) ?? 0) * 1.35,
        mass: 1 + Math.log2(1 + (degreeById.get(node.id) ?? 0)) * 2.4,
      }));

    return {
      nodes,
      links,
    };
  }, [graph, layers]);

  useEffect(() => {
    const graphApi = fgRef.current;
    if (!graphApi) return;

    const charge = graphApi.d3Force('charge');
    if (charge && typeof (charge as unknown as { strength?: (value: number) => unknown }).strength === 'function') {
      (
        charge as unknown as {
          strength: (value: number | ((node: ForceNode) => number)) => unknown;
        }
      ).strength((node: ForceNode) => {
        const degree = Math.max(0, node.degree ?? 0);
        const mass = Math.max(1, node.mass ?? 1);
        const base = -120;
        const degreeBoost = Math.min(80, degree * 4);
        return (base - degreeBoost) / Math.sqrt(mass);
      });
    }

    const linkForce = graphApi.d3Force('link');
    if (linkForce) {
      const linkApi = linkForce as unknown as {
        distance: (fn: (link: ForceLink) => number) => unknown;
        strength: (fn: (link: ForceLink) => number) => unknown;
      };
      linkApi.distance((link) => {
        const sourceDegree = getEndpointDegree(link.source);
        const targetDegree = getEndpointDegree(link.target);
        const hubness = (sourceDegree + targetDegree) / 2;
        const byWeight = 130 - Math.min(80, link.weight * 26);
        return Math.max(28, byWeight - Math.min(60, hubness * 4.5));
      });
      linkApi.strength((link) => {
        const sourceDegree = getEndpointDegree(link.source);
        const targetDegree = getEndpointDegree(link.target);
        const hubness = (sourceDegree + targetDegree) / 2;
        return Math.min(0.6, 0.06 + link.weight * 0.075 + hubness * 0.012);
      });
    }

    const reheatApi = graphApi as unknown as { d3ReheatSimulation?: () => void };
    if (typeof reheatApi.d3ReheatSimulation === 'function') {
      reheatApi.d3ReheatSimulation();
    }
  }, [forceData]);

  const toggleLayer = useCallback((layerId: LayerId) => {
    setLayers((current) => ({
      ...current,
      [layerId]: !current[layerId],
    }));
  }, []);

  const centerGraph = useCallback(() => {
    const graphApi = fgRef.current;
    if (!graphApi) return;
    graphApi.centerAt(0, 0, 350);
  }, []);

  const fitGraph = useCallback(() => {
    const graphApi = fgRef.current;
    if (!graphApi) return;
    graphApi.zoomToFit(450, 70);
  }, []);

  const zoomByFactor = useCallback((factor: number) => {
    const graphApi = fgRef.current as unknown as { zoom: (k: number, ms?: number) => void } | undefined;
    if (!graphApi) return;
    const next = Math.max(0.2, Math.min(10, zoomRef.current * factor));
    graphApi.zoom(next, 220);
    zoomRef.current = next;
  }, []);

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
      </div>

      {warningText ? <div className="warnings">{warningText}</div> : null}

      <div className="graph-scroll">
        <div className="graph-canvas-host">
          <div className="graph-overlay graph-overlay-left">
            <div className="layer-panel">
              <div className="layer-panel-title">Layers</div>
              {LAYER_OPTIONS.map((option) => (
                <label className="layer-toggle" key={option.id}>
                  <input
                    type="checkbox"
                    checked={layers[option.id]}
                    onChange={() => toggleLayer(option.id)}
                  />
                  <span className="label">{option.label}</span>
                  <span className="count">{layerCounts[option.id]}</span>
                  <span className="desc">{option.description}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="graph-overlay graph-overlay-right">
            <div className="graph-controls">
              <button type="button" onClick={centerGraph}>
                Center
              </button>
              <button type="button" onClick={fitGraph}>
                Fit
              </button>
              <div className="zoom-row">
                <button type="button" onClick={() => zoomByFactor(0.85)}>
                  −
                </button>
                <button type="button" onClick={() => zoomByFactor(1.2)}>
                  +
                </button>
              </div>
            </div>
          </div>

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
            onZoomEnd={(transform: ZoomTransform) => {
              if (typeof transform.k === 'number' && Number.isFinite(transform.k)) {
                zoomRef.current = transform.k;
              }
            }}
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
              const size = Math.max(2.5, (current.val ?? 2.5) * 1.35);

              ctx.beginPath();
              ctx.arc(node.x ?? 0, node.y ?? 0, size, 0, 2 * Math.PI, false);
              ctx.fillStyle = color;
              ctx.fill();

              if (shouldRenderLabel(current, globalScale)) {
                const fontSize = Math.max(8, 11 / globalScale);
                ctx.font = `${fontSize}px sans-serif`;
                ctx.fillStyle = '#0f172a';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                const maxChars = globalScale > 2.2 ? 36 : globalScale > 1.8 ? 26 : 18;
                ctx.fillText(truncateLabel(current.label, maxChars), (node.x ?? 0) + size + 2, node.y ?? 0);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
