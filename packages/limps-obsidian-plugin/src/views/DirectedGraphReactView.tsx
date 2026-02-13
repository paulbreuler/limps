import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { forceCollide } from 'd3-force-3d';
import ForceGraph2D, { type ForceGraphMethods as ForceGraph2DMethods } from 'react-force-graph-2d';
import ForceGraph3D, { type ForceGraphMethods as ForceGraph3DMethods } from 'react-force-graph-3d';
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
  collisionRadius: number;
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

interface DisplaySettings {
  showArrows: boolean;
  textFadeThreshold: number;
  nodeSizeScale: number;
  linkThickness: number;
  labelMaxChars: number;
}

interface ForceSettings {
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
}

interface LinkEndpoint {
  degree?: number;
}

interface GraphCameraPosition {
  x?: number;
  y?: number;
  z?: number;
}

interface GraphLookAt {
  x: number;
  y: number;
  z: number;
}

interface GraphApi {
  centerAt?: (x?: number, y?: number, ms?: number) => void;
  zoomToFit: (ms?: number, padding?: number) => void;
  zoom?: (k: number, ms?: number) => void;
  cameraPosition?: (position?: GraphCameraPosition, lookAt?: GraphLookAt, ms?: number) => void;
  getGraphBbox?: () => { x?: [number, number]; y?: [number, number]; z?: [number, number] } | null;
  d3Force: (name: string, force?: unknown) => unknown;
  d3ReheatSimulation?: () => void;
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

const PHYSICS_COOLDOWN_TICKS = 1_000_000;

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showArrows: true,
  textFadeThreshold: 1.1,
  nodeSizeScale: 0.85,
  linkThickness: 1,
  labelMaxChars: 26,
};

const DEFAULT_FORCE_SETTINGS: ForceSettings = {
  centerForce: 0.22,
  repelForce: 220,
  linkForce: 0.22,
  linkDistance: 180,
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
  const endpoint = value as LinkEndpoint | null;
  const maybe = endpoint?.degree;
  return typeof maybe === 'number' && Number.isFinite(maybe) ? maybe : 0;
}

function isEdgeEnabledByLayers(edgeType: DirectedEdgeType, layers: LayerState): boolean {
  return LAYER_OPTIONS.some((option) => layers[option.id] && option.edgeTypes.includes(edgeType));
}

function shouldShowEdge(edge: DirectedGraphEdge, layers: LayerState): boolean {
  return isEdgeEnabledByLayers(edge.type, layers);
}

function shouldRenderLabel(node: ForceNode, globalScale: number, textFadeThreshold: number): boolean {
  if (globalScale < textFadeThreshold) {
    return false;
  }

  if (globalScale < textFadeThreshold + 0.45) {
    return node.type === 'plan' || node.type === 'roadmap';
  }

  if (globalScale < textFadeThreshold + 0.9) {
    return node.type === 'plan' || node.type === 'roadmap' || node.type === 'agent';
  }

  return true;
}

function truncateLabel(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function fileNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const name = normalized.split('/').pop();
  return name && name.length > 0 ? name : filePath;
}

function estimateCollisionRadius(node: DirectedGraphNode, degree: number, sizeScale: number, labelMaxChars: number): number {
  const nodeRadius = Math.max(3.5, (nodeValue(node.type) + Math.sqrt(degree) * 1.35) * 1.35 * sizeScale);
  const visibleChars = Math.min(labelMaxChars, Math.max(8, node.label.length));
  const labelRadius = Math.min(28, visibleChars * 1.1);
  return nodeRadius + labelRadius;
}

export function DirectedGraphReactView({ plugin }: DirectedGraphReactViewProps) {
  useObsidianApp();
  const [graph, setGraph] = useState<DirectedGraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('physics');
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
  const [forceSettings, setForceSettings] = useState<ForceSettings>(DEFAULT_FORCE_SETTINGS);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showLayerPanel, setShowLayerPanel] = useState<boolean>(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState<boolean>(false);
  const [use3D, setUse3D] = useState<boolean>(true);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 960, height: 640 });

  const hostRef = useRef<HTMLDivElement | null>(null);
  const fg2dRef = useRef<ForceGraph2DMethods<ForceNode, ForceLink> | undefined>(undefined);
  const fg3dRef = useRef<ForceGraph3DMethods<ForceNode, ForceLink> | undefined>(undefined);
  const zoomRef = useRef<number>(1);
  const cameraDistanceRef = useRef<number>(800);

  const getGraphApi = useCallback((): GraphApi | null => {
    return use3D
      ? ((fg3dRef.current as unknown as GraphApi | undefined) ?? null)
      : ((fg2dRef.current as unknown as GraphApi | undefined) ?? null);
  }, [use3D]);

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

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(300, Math.floor(entry.contentRect.width));
      const height = Math.max(260, Math.floor(entry.contentRect.height));
      setCanvasSize((current) => {
        if (current.width === width && current.height === height) return current;
        return { width, height };
      });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!use3D) return;
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    const hasWebGl = Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    if (!hasWebGl) {
      setUse3D(false);
    }
  }, [use3D]);

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

    const filteredByLayer = graph.edges
      .filter((edge) => shouldShowEdge(edge, layers))
      .map((edge) => ({
        source: edge.from,
        target: edge.to,
        type: edge.type,
        label: EDGE_LABELS[edge.type],
        weight: EDGE_WEIGHT[edge.type],
      }));

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const matchedNodeIds = new Set<string>();
    if (normalizedSearch.length > 0) {
      for (const node of graph.nodes) {
        const haystack = `${node.label} ${node.filePath}`.toLowerCase();
        if (haystack.includes(normalizedSearch)) {
          matchedNodeIds.add(node.id);
        }
      }
    }

    const expandedNodeIds = new Set<string>(matchedNodeIds);
    if (normalizedSearch.length > 0) {
      for (const edge of filteredByLayer) {
        if (matchedNodeIds.has(edge.source) || matchedNodeIds.has(edge.target)) {
          expandedNodeIds.add(edge.source);
          expandedNodeIds.add(edge.target);
        }
      }
    }

    const links =
      normalizedSearch.length === 0
        ? filteredByLayer
        : filteredByLayer.filter((edge) => expandedNodeIds.has(edge.source) && expandedNodeIds.has(edge.target));

    const visibleNodeIds = new Set<string>();
    for (const link of links) {
      visibleNodeIds.add(link.source);
      visibleNodeIds.add(link.target);
    }

    if (normalizedSearch.length > 0 && visibleNodeIds.size === 0 && expandedNodeIds.size > 0) {
      for (const id of expandedNodeIds) {
        visibleNodeIds.add(id);
      }
    }

    const degreeById = new Map<string, number>();
    for (const link of links) {
      degreeById.set(link.source, (degreeById.get(link.source) ?? 0) + 1);
      degreeById.set(link.target, (degreeById.get(link.target) ?? 0) + 1);
    }

    const nodes = graph.nodes
      .filter((node) => visibleNodeIds.size === 0 || visibleNodeIds.has(node.id))
      .map((node) => {
        const degree = degreeById.get(node.id) ?? 0;
        return {
          id: node.id,
          label: node.label,
          type: node.type,
          filePath: node.filePath,
          planId: node.planId,
          degree,
          val: (nodeValue(node.type) + Math.sqrt(degree) * 1.35) * displaySettings.nodeSizeScale,
          mass: 1 + Math.log2(1 + degree) * 2.4,
          collisionRadius: estimateCollisionRadius(
            node,
            degree,
            displaySettings.nodeSizeScale,
            displaySettings.labelMaxChars
          ),
        };
      });

    return {
      nodes,
      links,
    };
  }, [
    graph,
    layers,
    searchTerm,
    displaySettings.labelMaxChars,
    displaySettings.nodeSizeScale,
  ]);

  useEffect(() => {
    const graphApi = getGraphApi();
    if (!graphApi || layoutMode !== 'physics') return;

    const charge = graphApi.d3Force('charge');
    const chargeApi = charge as unknown as {
      strength?: (value: number | ((node: ForceNode) => number)) => unknown;
    };
    if (chargeApi && typeof chargeApi.strength === 'function') {
      (
        chargeApi.strength
      )((node: ForceNode) => {
        const degree = Math.max(0, node.degree ?? 0);
        const mass = Math.max(1, node.mass ?? 1);
        const base = -Math.max(20, forceSettings.repelForce);
        const degreeBias = Math.min(55, degree * 2.2);
        return (base - degreeBias) / Math.max(1, mass * 0.35);
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
        const orbitDistance = Math.max(30, forceSettings.linkDistance);
        const distanceByHub = Math.min(90, hubness * 2.5);
        const weightBias = Math.min(45, link.weight * 10);
        return Math.max(30, orbitDistance + distanceByHub - weightBias);
      });

      linkApi.strength((link) => {
        const sourceDegree = getEndpointDegree(link.source);
        const targetDegree = getEndpointDegree(link.target);
        const hubness = (sourceDegree + targetDegree) / 2;
        const elastic = Math.max(0.02, forceSettings.linkForce);
        const weighted = 0.06 + link.weight * 0.08 + Math.min(0.25, hubness * 0.01);
        return Math.min(0.55, elastic * weighted);
      });
    }

    const xForce = graphApi.d3Force('x');
    const xApi = xForce as unknown as { strength?: (value: number) => unknown };
    if (xApi && typeof xApi.strength === 'function') {
      xApi.strength(forceSettings.centerForce * 0.12);
    }

    const yForce = graphApi.d3Force('y');
    const yApi = yForce as unknown as { strength?: (value: number) => unknown };
    if (yApi && typeof yApi.strength === 'function') {
      yApi.strength(forceSettings.centerForce * 0.12);
    }

    const collisionForce = forceCollide<ForceNode>((node: ForceNode) => Math.max(10, node.collisionRadius))
      .strength(0.35)
      .iterations(1);
    graphApi.d3Force('collision', collisionForce);

    const reheatApi = graphApi as { d3ReheatSimulation?: () => void };
    if (typeof reheatApi.d3ReheatSimulation === 'function') {
      reheatApi.d3ReheatSimulation();
    }
  }, [forceData, forceSettings, layoutMode, getGraphApi]);

  const toggleLayer = useCallback((layerId: LayerId) => {
    setLayers((current) => ({
      ...current,
      [layerId]: !current[layerId],
    }));
  }, []);

  const updateDisplaySetting = useCallback(<K extends keyof DisplaySettings>(key: K, value: DisplaySettings[K]) => {
    setDisplaySettings((current) => ({
      ...current,
      [key]: value,
    }));
  }, []);

  const updateForceSetting = useCallback(<K extends keyof ForceSettings>(key: K, value: ForceSettings[K]) => {
    setForceSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }, []);

  const getCurrentBounds = useCallback(() => {
    const graphApi = getGraphApi();
    const bbox = graphApi?.getGraphBbox?.();
    const x0 = bbox?.x?.[0];
    const x1 = bbox?.x?.[1];
    const y0 = bbox?.y?.[0];
    const y1 = bbox?.y?.[1];
    const z0 = bbox?.z?.[0] ?? 0;
    const z1 = bbox?.z?.[1] ?? 0;
    if (
      typeof x0 === 'number' &&
      typeof x1 === 'number' &&
      typeof y0 === 'number' &&
      typeof y1 === 'number' &&
      Number.isFinite(x0) &&
      Number.isFinite(x1) &&
      Number.isFinite(y0) &&
      Number.isFinite(y1)
    ) {
      return { x0, x1, y0, y1, z0, z1 };
    }

    if (forceData.nodes.length === 0) {
      return null;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const raw of forceData.nodes) {
      const node = raw as ForceNode & { x?: number; y?: number; z?: number };
      const x = typeof node.x === 'number' ? node.x : 0;
      const y = typeof node.y === 'number' ? node.y : 0;
      const z = typeof node.z === 'number' ? node.z : 0;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
      return null;
    }

    return { x0: minX, x1: maxX, y0: minY, y1: maxY, z0: minZ, z1: maxZ };
  }, [forceData.nodes, getGraphApi]);

  const centerGraph = useCallback(() => {
    const graphApi = getGraphApi();
    if (!graphApi) return;
    const bounds = getCurrentBounds();
    const centerX = bounds ? (bounds.x0 + bounds.x1) / 2 : 0;
    const centerY = bounds ? (bounds.y0 + bounds.y1) / 2 : 0;
    const centerZ = bounds ? (bounds.z0 + bounds.z1) / 2 : 0;
    if (use3D && graphApi.cameraPosition) {
      graphApi.cameraPosition(
        { x: centerX, y: centerY, z: centerZ + cameraDistanceRef.current },
        { x: centerX, y: centerY, z: centerZ },
        350
      );
      return;
    }
    graphApi.centerAt?.(centerX, centerY, 350);
  }, [getCurrentBounds, getGraphApi, use3D]);

  const fitGraph = useCallback(() => {
    const graphApi = getGraphApi();
    if (!graphApi) return;
    const bounds = getCurrentBounds();
    if (!bounds) {
      graphApi.zoomToFit(450, 70);
      return;
    }

    const centerX = (bounds.x0 + bounds.x1) / 2;
    const centerY = (bounds.y0 + bounds.y1) / 2;
    const centerZ = (bounds.z0 + bounds.z1) / 2;
    const dx = Math.max(1, bounds.x1 - bounds.x0);
    const dy = Math.max(1, bounds.y1 - bounds.y0);
    const dz = Math.max(1, bounds.z1 - bounds.z0);

    if (use3D && graphApi.cameraPosition) {
      const extent = Math.max(dx, dy, dz);
      const distance = Math.max(240, Math.min(4200, extent * 2.25));
      cameraDistanceRef.current = distance;
      graphApi.cameraPosition(
        { x: centerX, y: centerY, z: centerZ + distance },
        { x: centerX, y: centerY, z: centerZ },
        450
      );
      return;
    }

    graphApi.centerAt?.(centerX, centerY, 250);
    if (typeof graphApi.zoom === 'function') {
      const paddingPx = 80;
      const usableWidth = Math.max(120, canvasSize.width - paddingPx * 2);
      const usableHeight = Math.max(120, canvasSize.height - paddingPx * 2);
      const fitScale = Math.max(0.14, Math.min(8, Math.min(usableWidth / dx, usableHeight / dy)));
      zoomRef.current = fitScale;
      graphApi.zoom(fitScale, 250);
      return;
    }

    graphApi.zoomToFit(450, 70);
  }, [canvasSize.height, canvasSize.width, getCurrentBounds, getGraphApi, use3D]);

  const zoomByFactor = useCallback((factor: number) => {
    const graphApi = getGraphApi();
    if (!graphApi) return;
    if (typeof graphApi.zoom === 'function') {
      const next = Math.max(0.2, Math.min(10, zoomRef.current * factor));
      graphApi.zoom(next, 220);
      zoomRef.current = next;
      return;
    }

    if (use3D && typeof graphApi.cameraPosition === 'function') {
      const nextDistance = Math.max(140, Math.min(3200, cameraDistanceRef.current / factor));
      cameraDistanceRef.current = nextDistance;
      const bounds = getCurrentBounds();
      const centerX = bounds ? (bounds.x0 + bounds.x1) / 2 : 0;
      const centerY = bounds ? (bounds.y0 + bounds.y1) / 2 : 0;
      const centerZ = bounds ? (bounds.z0 + bounds.z1) / 2 : 0;
      graphApi.cameraPosition({ x: centerX, y: centerY, z: centerZ + nextDistance }, { x: centerX, y: centerY, z: centerZ }, 220);
    }
  }, [getCurrentBounds, getGraphApi, use3D]);

  const reheatSimulation = useCallback(() => {
    const graphApi = getGraphApi();
    if (graphApi && typeof graphApi.d3ReheatSimulation === 'function') {
      graphApi.d3ReheatSimulation();
    }
  }, [getGraphApi]);

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
        <div className="graph-canvas-host" ref={hostRef}>
          <div className="graph-overlay graph-overlay-left">
            {showLayerPanel ? (
              <div className="layer-panel">
                <div className="layer-panel-title">Filters</div>
                <div className="layer-search-wrap">
                  <input
                    className="layer-search"
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.currentTarget.value)}
                    placeholder="Search files..."
                  />
                </div>
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
            ) : null}
            <div className="map-toolbar">
              <button
                type="button"
                className={`map-icon-btn ${showLayerPanel ? 'active' : ''}`}
                title="Filters and layers"
                aria-label="Filters and layers"
                onClick={() => setShowLayerPanel((open) => !open)}
              >
                ☰
              </button>
            </div>
          </div>

          <div className="graph-overlay graph-overlay-right">
            <div className="map-toolbar">
              <button type="button" className="map-icon-btn" title="Center" aria-label="Center" onClick={centerGraph}>
                ◎
              </button>
              <button type="button" className="map-icon-btn" title="Fit" aria-label="Fit" onClick={fitGraph}>
                ⤢
              </button>
              <button
                type="button"
                className="map-icon-btn"
                title="Zoom out"
                aria-label="Zoom out"
                onClick={() => zoomByFactor(0.85)}
              >
                −
              </button>
              <button
                type="button"
                className="map-icon-btn"
                title="Zoom in"
                aria-label="Zoom in"
                onClick={() => zoomByFactor(1.2)}
              >
                +
              </button>
              <button
                type="button"
                className={`map-icon-btn ${showSettingsPanel ? 'active' : ''}`}
                title="Display and force settings"
                aria-label="Display and force settings"
                onClick={() => setShowSettingsPanel((open) => !open)}
              >
                ⚙
              </button>
              <button
                type="button"
                className={`map-icon-btn ${use3D ? 'active' : ''}`}
                title={use3D ? 'Switch to 2D' : 'Switch to 3D'}
                aria-label={use3D ? 'Switch to 2D' : 'Switch to 3D'}
                onClick={() => setUse3D((value) => !value)}
              >
                3D
              </button>
            </div>
            {showSettingsPanel ? (
              <div className="graph-settings-panel">
                <details>
                <summary>Display</summary>
                <label className="toggle-row">
                  <span>Arrows</span>
                  <input
                    type="checkbox"
                    checked={displaySettings.showArrows}
                    onChange={(event) => updateDisplaySetting('showArrows', event.currentTarget.checked)}
                  />
                </label>
                <label className="slider-row">
                  <span>Text fade threshold</span>
                  <input
                    type="range"
                    min={0.8}
                    max={2.2}
                    step={0.05}
                    value={displaySettings.textFadeThreshold}
                    onChange={(event) =>
                      updateDisplaySetting('textFadeThreshold', Number(event.currentTarget.value))
                    }
                  />
                </label>
                <label className="slider-row">
                  <span>Node size</span>
                  <input
                    type="range"
                    min={0.65}
                    max={1.9}
                    step={0.05}
                    value={displaySettings.nodeSizeScale}
                    onChange={(event) => updateDisplaySetting('nodeSizeScale', Number(event.currentTarget.value))}
                  />
                </label>
                <label className="slider-row">
                  <span>Link thickness</span>
                  <input
                    type="range"
                    min={0.6}
                    max={2.8}
                    step={0.05}
                    value={displaySettings.linkThickness}
                    onChange={(event) => updateDisplaySetting('linkThickness', Number(event.currentTarget.value))}
                  />
                </label>
                <label className="slider-row">
                  <span>Label max length</span>
                  <input
                    type="range"
                    min={10}
                    max={44}
                    step={1}
                    value={displaySettings.labelMaxChars}
                    onChange={(event) => updateDisplaySetting('labelMaxChars', Number(event.currentTarget.value))}
                  />
                </label>
              </details>

              <details>
                <summary>Forces</summary>
                <label className="slider-row">
                  <span>Center force</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={forceSettings.centerForce}
                    onChange={(event) => updateForceSetting('centerForce', Number(event.currentTarget.value))}
                  />
                </label>
                <label className="slider-row">
                  <span>Repel force</span>
                  <input
                    type="range"
                    min={40}
                    max={420}
                    step={5}
                    value={forceSettings.repelForce}
                    onChange={(event) => updateForceSetting('repelForce', Number(event.currentTarget.value))}
                  />
                </label>
                <label className="slider-row">
                  <span>Link force</span>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.01}
                    value={forceSettings.linkForce}
                    onChange={(event) => updateForceSetting('linkForce', Number(event.currentTarget.value))}
                  />
                </label>
                <label className="slider-row">
                  <span>Link distance</span>
                  <input
                    type="range"
                    min={40}
                    max={260}
                    step={2}
                    value={forceSettings.linkDistance}
                    onChange={(event) => updateForceSetting('linkDistance', Number(event.currentTarget.value))}
                  />
                </label>
                <button type="button" onClick={reheatSimulation}>
                  Animate
                </button>
              </details>
              </div>
            ) : null}
          </div>

          {use3D ? (
            <ForceGraph3D
              ref={fg3dRef}
              graphData={forceData}
              width={canvasSize.width}
              height={canvasSize.height}
              warmupTicks={layoutMode === 'physics' ? 60 : 20}
              cooldownTicks={layoutMode === 'physics' ? PHYSICS_COOLDOWN_TICKS : 120}
              linkDirectionalArrowLength={displaySettings.showArrows ? 4 : 0}
              linkDirectionalArrowRelPos={displaySettings.showArrows ? 1 : 0}
              linkWidth={(link) => Math.max(0.8, link.weight * displaySettings.linkThickness)}
              linkColor={(link) => {
                if (link.type === 'depends-on') return '#dc2626';
                if (link.type === 'plan-contains') return '#2563eb';
                if (link.type === 'related-doc') return '#14b8a6';
                if (link.type === 'related-canvas') return '#7c3aed';
                if (link.type === 'related-base') return '#0f766e';
                if (link.type === 'references') return '#64748b';
                return '#f59e0b';
              }}
              nodeColor={(node) => NODE_COLOR[(node as ForceNode).type] ?? '#64748b'}
              nodeVal={(node) => Math.max(1.2, (node as ForceNode).val)}
              nodeLabel={(node) => {
                const current = node as ForceNode;
                return fileNameFromPath(current.filePath);
              }}
              onNodeClick={(node) => handleNodeClick(node as ForceNode)}
              onNodeDrag={reheatSimulation}
              onNodeDragEnd={(node) => {
                const dragged = node as { fx?: number; fy?: number; fz?: number; vx?: number; vy?: number; vz?: number };
                dragged.fx = undefined;
                dragged.fy = undefined;
                dragged.fz = undefined;
                if (typeof dragged.vx === 'number') dragged.vx *= 0.8;
                if (typeof dragged.vy === 'number') dragged.vy *= 0.8;
                if (typeof dragged.vz === 'number') dragged.vz *= 0.8;
                reheatSimulation();
              }}
              backgroundColor="rgba(0,0,0,0)"
            />
          ) : (
            <ForceGraph2D
              ref={fg2dRef}
              graphData={forceData}
              width={canvasSize.width}
              height={canvasSize.height}
              nodeRelSize={4.5}
              dagMode={layoutMode === 'flow' ? 'td' : undefined}
              dagLevelDistance={layoutMode === 'flow' ? 90 : undefined}
              d3AlphaDecay={layoutMode === 'physics' ? 0.009 : 0.04}
              d3VelocityDecay={layoutMode === 'physics' ? 0.18 : 0.45}
              warmupTicks={layoutMode === 'physics' ? 60 : 20}
              cooldownTicks={layoutMode === 'physics' ? PHYSICS_COOLDOWN_TICKS : 120}
              linkDirectionalArrowLength={displaySettings.showArrows ? 4 : 0}
              linkDirectionalArrowRelPos={displaySettings.showArrows ? 1 : 0}
              linkWidth={(link) => Math.max(0.8, link.weight * displaySettings.linkThickness)}
              linkColor={(link) => {
                if (link.type === 'depends-on') return '#dc2626';
                if (link.type === 'plan-contains') return '#2563eb';
                if (link.type === 'related-doc') return '#14b8a6';
                if (link.type === 'related-canvas') return '#7c3aed';
                if (link.type === 'related-base') return '#0f766e';
                if (link.type === 'references') return '#64748b';
                return '#f59e0b';
              }}
              nodeLabel={(node) => {
                const current = node as ForceNode;
                return fileNameFromPath(current.filePath);
              }}
              onNodeClick={(node) => handleNodeClick(node as ForceNode)}
              onNodeDrag={reheatSimulation}
              onZoomEnd={(transform: ZoomTransform) => {
                if (typeof transform.k === 'number' && Number.isFinite(transform.k)) {
                  zoomRef.current = transform.k;
                }
              }}
              onNodeDragEnd={(node) => {
                const dragged = node as { fx?: number; fy?: number; vx?: number; vy?: number };
                dragged.fx = undefined;
                dragged.fy = undefined;
                if (typeof dragged.vx === 'number') dragged.vx *= 0.75;
                if (typeof dragged.vy === 'number') dragged.vy *= 0.75;
                reheatSimulation();
              }}
              nodeCanvasObject={(node, ctx, globalScale) => {
                const current = node as ForceNode;
                const color = NODE_COLOR[current.type] ?? '#64748b';
                const size = Math.max(2.5, (current.val ?? 2.5) * 1.35);

                ctx.beginPath();
                ctx.arc(node.x ?? 0, node.y ?? 0, size, 0, 2 * Math.PI, false);
                ctx.fillStyle = color;
                ctx.fill();

                if (shouldRenderLabel(current, globalScale, displaySettings.textFadeThreshold)) {
                  const fontSize = Math.max(8, 11 / globalScale);
                  ctx.font = `${fontSize}px sans-serif`;
                  ctx.fillStyle = '#0f172a';
                  ctx.textAlign = 'left';
                  ctx.textBaseline = 'middle';
                  const zoomRatio = Math.max(
                    0.35,
                    Math.min(1, globalScale - displaySettings.textFadeThreshold + 0.2)
                  );
                  const maxChars = Math.max(
                    10,
                    Math.min(displaySettings.labelMaxChars, Math.round(displaySettings.labelMaxChars * zoomRatio))
                  );
                  ctx.fillText(truncateLabel(current.label, maxChars), (node.x ?? 0) + size + 2, node.y ?? 0);
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
