import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';

export type DirectedNodeType = 'plan' | 'agent' | 'doc' | 'canvas' | 'base';
export type DirectedEdgeType = 'plan-contains' | 'depends-on' | 'blocks' | 'related-doc' | 'related-canvas' | 'related-base';

export interface DirectedGraphNode {
  id: string;
  type: DirectedNodeType;
  label: string;
  filePath: string;
  planId: string;
}

export interface DirectedGraphEdge {
  from: string;
  to: string;
  type: DirectedEdgeType;
}

export interface DirectedGraphCycle {
  nodeIds: string[];
  labels: string[];
}

export interface DirectedGraphData {
  nodes: DirectedGraphNode[];
  edges: DirectedGraphEdge[];
  warnings: string[];
  cycles: DirectedGraphCycle[];
  stats: {
    plans: number;
    agents: number;
    docs: number;
    canvas: number;
    base: number;
    edges: number;
    unresolvedRelations: number;
    isolatedAgents: number;
  };
}

interface FrontmatterSlice {
  frontmatter?: string;
  body: string;
  hasFrontmatter: boolean;
}

function walkDirectories(root: string, dirName: string): string[] {
  const found: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    let entries: { isDirectory(): boolean; name: string | Buffer }[];
    try {
      entries = readdirSync(current, { withFileTypes: true }) as { isDirectory(): boolean; name: string | Buffer }[];
    } catch {
      continue;
    }

    for (const entry of entries) {
      const name = String(entry.name);
      const fullPath = join(current, name);
      if (!entry.isDirectory()) continue;
      if (name === '.obsidian' || name === '.git' || name === 'node_modules') {
        continue;
      }
      if (name === dirName) {
        found.push(fullPath);
      } else {
        stack.push(fullPath);
      }
    }
  }

  return found;
}

function parseFrontmatterSections(content: string): FrontmatterSlice {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match || !match[0]) {
    return { hasFrontmatter: false, body: content };
  }
  return {
    hasFrontmatter: true,
    frontmatter: match[1] ?? '',
    body: content.slice(match[0].length),
  };
}

function parseRelationFromFrontmatter(frontmatter: string | undefined, keys: string[]): string[] {
  if (!frontmatter) return [];

  const values: string[] = [];
  const keyPattern = `(?:${keys.map((key) => key.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')).join('|')})`;

  const inlineMatch = frontmatter.match(new RegExp(`^${keyPattern}:\\s*\\[([^\\]]*)\\]`, 'm'));
  if (inlineMatch?.[1]) {
    values.push(
      ...inlineMatch[1]
        .split(',')
        .map((part) => parseRelationToken(part))
        .filter((value): value is string => Boolean(value))
    );
  }

  const lines = frontmatter.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!(new RegExp(`^${keyPattern}:\\s*$`).test(line.trim()))) continue;

    for (let j = i + 1; j < lines.length; j++) {
      const depLine = lines[j] ?? '';
      const match = depLine.match(/^\s*-\s*(.+)$/);
      if (!match?.[1]) break;
      const normalized = parseRelationToken(match[1]);
      if (normalized) values.push(normalized);
    }
  }

  return Array.from(new Set(values));
}

function parseRelationToken(value: string): string | null {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed) return null;

  const markdown = trimmed.match(/^\[[^\]]*]\(([^)]+)\)$/);
  const wikilink = trimmed.match(/^\[\[([^\]]+)\]\]$/);
  const token = markdown?.[1]?.trim() ?? wikilink?.[1]?.split('|')[0]?.trim() ?? trimmed;
  if (!token) return null;

  if (/^\d{1,3}$/.test(token)) {
    return token.padStart(3, '0');
  }

  if (/^\d{4}#\d{3}$/.test(token)) {
    return token.slice(-3);
  }

  return token;
}

function getAgentNumber(filename: string): string | null {
  const stem = basename(filename, extname(filename));
  const match = stem.match(/^(\d{3})/);
  return match ? match[1] : null;
}

function normalizePathForMap(value: string): string {
  return normalize(value).replace(/\\/g, '/');
}

function parseDependsOn(frontmatter: string | undefined): string[] {
  return parseRelationFromFrontmatter(frontmatter, ['depends_on', 'dependencies']);
}

function parseBlocks(frontmatter: string | undefined): string[] {
  return parseRelationFromFrontmatter(frontmatter, ['blocks']);
}

function findPlanMarkdown(agentsDir: string): string | null {
  const planRoot = dirname(agentsDir);
  const candidates = readdirSync(planRoot).filter((name) => name.toLowerCase().endsWith('.md'));
  const preferred = candidates.find((name) => /-plan\.md$/i.test(name));
  const selected = preferred ?? candidates[0];
  return selected ? join(planRoot, selected) : null;
}

function resolveAgentRelation(
  relation: string,
  currentFile: string,
  planRoot: string,
  agentsDir: string,
  byNumber: Map<string, string>,
  byStem: Map<string, string>,
  byPath: Map<string, string>
): string | null {
  if (/^\d{3}$/.test(relation)) {
    return byNumber.get(relation) ?? null;
  }

  const stripped = relation.split('#')[0]?.split('?')[0] ?? relation;
  if (!stripped) return null;

  const stem = basename(stripped, extname(stripped));
  const byStemMatch = byStem.get(stem);
  if (byStemMatch) return byStemMatch;

  const candidates: string[] = [];
  if (isAbsolute(stripped)) {
    candidates.push(stripped);
  } else {
    candidates.push(resolve(dirname(currentFile), stripped));
    candidates.push(resolve(planRoot, stripped));
    candidates.push(resolve(agentsDir, stripped));
  }

  for (const candidate of candidates) {
    const normalized = normalizePathForMap(candidate);
    const match = byPath.get(normalized);
    if (match) return match;
  }

  return null;
}

function addEdge(edges: DirectedGraphEdge[], seen: Set<string>, from: string, to: string, type: DirectedEdgeType): void {
  if (!from || !to) return;
  const key = `${from}::${to}::${type}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push({ from, to, type });
}

function detectCycles(nodes: DirectedGraphNode[], edges: DirectedGraphEdge[]): DirectedGraphCycle[] {
  const dependencyEdges = edges.filter((edge) => edge.type === 'depends-on');
  const adjacency = new Map<string, string[]>();
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));

  for (const edge of dependencyEdges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from)?.push(edge.to);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];
  const cycles: DirectedGraphCycle[] = [];
  const seenSignatures = new Set<string>();

  const visit = (nodeId: string): void => {
    visited.add(nodeId);
    inStack.add(nodeId);
    stack.push(nodeId);

    const neighbors = adjacency.get(nodeId) ?? [];
    for (const next of neighbors) {
      if (!visited.has(next)) {
        visit(next);
        continue;
      }

      if (!inStack.has(next)) {
        continue;
      }

      const cycleStart = stack.lastIndexOf(next);
      if (cycleStart === -1) {
        continue;
      }

      const cycleNodeIds = stack.slice(cycleStart);
      const signature = [...cycleNodeIds].sort().join('|');
      if (seenSignatures.has(signature)) {
        continue;
      }

      seenSignatures.add(signature);
      cycles.push({
        nodeIds: cycleNodeIds,
        labels: cycleNodeIds.map((id) => nodeById.get(id)?.label ?? id),
      });
    }

    stack.pop();
    inStack.delete(nodeId);
  };

  for (const node of nodes) {
    if (node.type !== 'agent') continue;
    if (visited.has(node.id)) continue;
    visit(node.id);
  }

  return cycles;
}

function countIsolatedAgents(nodes: DirectedGraphNode[], edges: DirectedGraphEdge[]): number {
  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }

  return nodes.filter((node) => node.type === 'agent' && !connected.has(node.id)).length;
}

export function buildDirectedGraph(plansPath: string): DirectedGraphData {
  const nodes: DirectedGraphNode[] = [];
  const edges: DirectedGraphEdge[] = [];
  const edgeSet = new Set<string>();
  const warnings: string[] = [];
  const nodeIds = new Set<string>();

  const addNode = (node: DirectedGraphNode): void => {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  };

  const agentsDirs = walkDirectories(plansPath, 'agents');
  for (const agentsDir of agentsDirs) {
    const planRoot = dirname(agentsDir);
    const planMarkdown = findPlanMarkdown(agentsDir);
    const planId = relative(plansPath, planRoot).replace(/\\/g, '/') || basename(planRoot);
    const planFilePath = planMarkdown ?? planRoot;
    const planNodeId = `plan:${normalizePathForMap(planFilePath)}`;

    addNode({
      id: planNodeId,
      type: 'plan',
      label: basename(planRoot),
      filePath: planFilePath,
      planId,
    });

    const agentFiles = readdirSync(agentsDir)
      .filter((name) => name.endsWith('.agent.md'))
      .map((name) => join(agentsDir, name))
      .sort();

    const byNumber = new Map<string, string>();
    const byStem = new Map<string, string>();
    const byPath = new Map<string, string>();

    for (const agentPath of agentFiles) {
      const nodeId = `agent:${normalizePathForMap(agentPath)}`;
      const number = getAgentNumber(basename(agentPath));
      if (number) byNumber.set(number, agentPath);
      byStem.set(basename(agentPath, extname(agentPath)), agentPath);
      byPath.set(normalizePathForMap(agentPath), agentPath);

      const label = number
        ? `${number} ${basename(agentPath).replace(/^\d{3}[_-]?/, '').replace(/\.agent\.md$/, '')}`
        : basename(agentPath, '.agent.md');

      addNode({
        id: nodeId,
        type: 'agent',
        label,
        filePath: agentPath,
        planId,
      });

      addEdge(edges, edgeSet, planNodeId, nodeId, 'plan-contains');
    }

    for (const agentPath of agentFiles) {
      const sourceId = `agent:${normalizePathForMap(agentPath)}`;
      let raw: string;
      try {
        raw = readFileSync(agentPath, 'utf8');
      } catch {
        warnings.push(`Failed reading ${agentPath}`);
        continue;
      }

      const frontmatter = parseFrontmatterSections(raw).frontmatter;
      const deps = parseDependsOn(frontmatter);
      const blocks = parseBlocks(frontmatter);

      for (const dep of deps) {
        const targetFile = resolveAgentRelation(dep, agentPath, planRoot, agentsDir, byNumber, byStem, byPath);
        if (!targetFile) {
          warnings.push(`Unresolved depends_on '${dep}' in ${basename(agentPath)}`);
          continue;
        }

        const targetId = `agent:${normalizePathForMap(targetFile)}`;
        addEdge(edges, edgeSet, sourceId, targetId, 'depends-on');
      }

      for (const block of blocks) {
        const targetFile = resolveAgentRelation(block, agentPath, planRoot, agentsDir, byNumber, byStem, byPath);
        if (!targetFile) {
          warnings.push(`Unresolved blocks '${block}' in ${basename(agentPath)}`);
          continue;
        }

        const targetId = `agent:${normalizePathForMap(targetFile)}`;
        addEdge(edges, edgeSet, sourceId, targetId, 'blocks');
      }
    }

    const docs = readdirSync(planRoot)
      .filter((name) => name.toLowerCase().endsWith('.md'))
      .map((name) => join(planRoot, name))
      .filter((docPath) => docPath !== planMarkdown)
      .sort();

    for (const docPath of docs) {
      const nodeId = `doc:${normalizePathForMap(docPath)}`;
      addNode({
        id: nodeId,
        type: 'doc',
        label: basename(docPath, '.md'),
        filePath: docPath,
        planId,
      });
      addEdge(edges, edgeSet, planNodeId, nodeId, 'related-doc');
    }

    const canvases = readdirSync(planRoot)
      .filter((name) => name.toLowerCase().endsWith('.canvas'))
      .map((name) => join(planRoot, name))
      .sort();

    for (const canvasPath of canvases) {
      const nodeId = `canvas:${normalizePathForMap(canvasPath)}`;
      addNode({
        id: nodeId,
        type: 'canvas',
        label: basename(canvasPath, '.canvas'),
        filePath: canvasPath,
        planId,
      });
      addEdge(edges, edgeSet, planNodeId, nodeId, 'related-canvas');
    }

    const bases = readdirSync(planRoot)
      .filter((name) => name.toLowerCase().endsWith('.base'))
      .map((name) => join(planRoot, name))
      .sort();

    for (const basePath of bases) {
      const nodeId = `base:${normalizePathForMap(basePath)}`;
      addNode({
        id: nodeId,
        type: 'base',
        label: basename(basePath, '.base'),
        filePath: basePath,
        planId,
      });
      addEdge(edges, edgeSet, planNodeId, nodeId, 'related-base');
    }
  }

  const cycles = detectCycles(nodes, edges);
  const unresolvedRelations = warnings.filter((warning) => warning.startsWith('Unresolved')).length;

  return {
    nodes,
    edges,
    warnings,
    cycles,
    stats: {
      plans: nodes.filter((node) => node.type === 'plan').length,
      agents: nodes.filter((node) => node.type === 'agent').length,
      docs: nodes.filter((node) => node.type === 'doc').length,
      canvas: nodes.filter((node) => node.type === 'canvas').length,
      base: nodes.filter((node) => node.type === 'base').length,
      edges: edges.length,
      unresolvedRelations,
      isolatedAgents: countIsolatedAgents(nodes, edges),
    },
  };
}
