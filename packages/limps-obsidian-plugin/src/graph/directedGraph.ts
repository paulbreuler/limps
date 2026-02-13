import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, normalize, resolve } from 'node:path';

export type DirectedNodeType = 'plan' | 'agent' | 'doc' | 'roadmap' | 'canvas' | 'base';
export type DirectedEdgeType =
  | 'plan-contains'
  | 'depends-on'
  | 'related-doc'
  | 'related-canvas'
  | 'related-base'
  | 'references'
  | 'semantic-tag';

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
    roadmap: number;
    canvas: number;
    base: number;
    edges: number;
    referenceEdges: number;
    semanticEdges: number;
    unresolvedRelations: number;
    isolatedAgents: number;
  };
}

interface FrontmatterSlice {
  frontmatter?: string;
  body: string;
}

interface GraphBuildContext {
  plansPath: string;
  nodeByPath: Map<string, DirectedGraphNode>;
  nodesByStem: Map<string, DirectedGraphNode[]>;
  agentsByNumber: Map<string, DirectedGraphNode[]>;
  edges: DirectedGraphEdge[];
  edgeSet: Set<string>;
  warnings: string[];
}

const SUPPORTED_EXTENSIONS = ['.md', '.canvas', '.base'];

function normalizePath(value: string): string {
  return normalize(value).replace(/\\/g, '/');
}

function walkFiles(root: string): string[] {
  const files: string[] = [];
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

      if (entry.isDirectory()) {
        if (name === '.obsidian' || name === '.git' || name === 'node_modules') {
          continue;
        }
        stack.push(fullPath);
        continue;
      }

      const lower = name.toLowerCase();
      if (SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }

  return files.sort();
}

function parseFrontmatterSections(content: string): FrontmatterSlice {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match || !match[0]) {
    return { body: content };
  }

  return {
    frontmatter: match[1] ?? '',
    body: content.slice(match[0].length),
  };
}

function parseListFrontmatter(frontmatter: string | undefined, keys: string[]): string[] {
  if (!frontmatter) return [];

  const values: string[] = [];
  const keyPattern = `(?:${keys.map((key) => key.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')).join('|')})`;

  const inlineMatch = frontmatter.match(new RegExp(`^${keyPattern}:\\s*\\[([^\\]]*)\\]`, 'm'));
  if (inlineMatch?.[1]) {
    values.push(
      ...inlineMatch[1]
        .split(',')
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    );
  }

  const lines = frontmatter.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!(new RegExp(`^${keyPattern}:\\s*$`).test(line.trim()))) continue;

    for (let j = i + 1; j < lines.length; j++) {
      const listLine = lines[j] ?? '';
      const match = listLine.match(/^\s*-\s*(.+)$/);
      if (!match?.[1]) break;
      values.push(match[1].trim().replace(/^['"]|['"]$/g, ''));
    }
  }

  return Array.from(new Set(values));
}

function parseDependsOn(frontmatter: string | undefined): string[] {
  return parseListFrontmatter(frontmatter, ['depends_on', 'dependencies']);
}

function parseBlocks(frontmatter: string | undefined): string[] {
  return parseListFrontmatter(frontmatter, ['blocks']);
}

function parseTags(frontmatter: string | undefined): string[] {
  return parseListFrontmatter(frontmatter, ['tags'])
    .map((tag) => tag.toLowerCase())
    .filter(Boolean);
}

function parseMarkdownLinks(text: string): string[] {
  const tokens: string[] = [];

  const markdownRegex = /(?<!!)\[[^\]]*]\(([^)]+)\)/g;
  let markdownMatch: RegExpExecArray | null;
  while ((markdownMatch = markdownRegex.exec(text)) !== null) {
    const raw = markdownMatch[1]?.trim();
    if (!raw) continue;
    tokens.push(raw);
  }

  const wikilinkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?]]/g;
  let wikilinkMatch: RegExpExecArray | null;
  while ((wikilinkMatch = wikilinkRegex.exec(text)) !== null) {
    const raw = wikilinkMatch[1]?.trim();
    if (!raw) continue;
    tokens.push(raw);
  }

  return Array.from(new Set(tokens));
}

function isExternalReference(token: string): boolean {
  const value = token.trim().toLowerCase();
  if (!value) return true;
  if (value.startsWith('#')) return true;
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('mailto:') ||
    value.startsWith('obsidian://')
  );
}

function isDirectoryLikeReference(token: string): boolean {
  return token.trim().endsWith('/');
}

function isPlaceholderReference(token: string): boolean {
  const value = token.trim().toLowerCase();
  if (!value) return true;
  if (value === 'path.md' || value === 'file.md' || value === 'example.md') return true;
  if (value.startsWith('<') || value.includes('{') || value.includes('}')) return true;
  return false;
}

function getAgentNumberFromFilename(filename: string): string | null {
  const stem = basename(filename, extname(filename));
  const match = stem.match(/^(\d{3})/);
  return match?.[1] ?? null;
}

function classifyNodeType(filePath: string): DirectedNodeType {
  const lowerPath = filePath.toLowerCase();
  const fileName = basename(filePath).toLowerCase();

  if (lowerPath.endsWith('.agent.md')) return 'agent';
  if (lowerPath.endsWith('-plan.md')) return 'plan';
  if (lowerPath.endsWith('.canvas')) return 'canvas';
  if (lowerPath.endsWith('.base')) return 'base';
  if (fileName === 'roadmap.md' || lowerPath.includes('/roadmap/')) return 'roadmap';
  return 'doc';
}

function labelForNode(filePath: string, type: DirectedNodeType): string {
  const fileName = basename(filePath);

  if (type === 'agent') {
    const number = getAgentNumberFromFilename(fileName);
    const readable = fileName.replace(/^\d{3}[_-]?/, '').replace(/\.agent\.md$/i, '');
    return number ? `${number} ${readable}` : readable;
  }

  if (type === 'plan') {
    return basename(filePath).replace(/-plan\.md$/i, '');
  }

  return basename(filePath, extname(filePath));
}

function planIdForPath(plansPath: string, filePath: string): string {
  const relativePath = normalizePath(filePath).slice(normalizePath(plansPath).length).replace(/^\/+/, '');
  const segments = relativePath.split('/').filter(Boolean);
  if (segments.length === 0) return '_root';

  const first = segments[0] ?? '';
  const second = segments[1] ?? '';
  const firstLooksLikePlanId = /^\d{3,4}[-_]/.test(first);
  const secondLooksLikePlanId = /^\d{3,4}[-_]/.test(second);

  if (firstLooksLikePlanId) {
    return first;
  }

  if (secondLooksLikePlanId) {
    // Preserve container namespace (for example Completed/0030-...) so grouped folders don't collapse to one plan.
    return `${first}/${second}`;
  }

  return first;
}

function addEdge(context: GraphBuildContext, from: string, to: string, type: DirectedEdgeType): void {
  if (!from || !to) return;
  const key = `${from}::${to}::${type}`;
  if (context.edgeSet.has(key)) return;
  context.edgeSet.add(key);
  context.edges.push({ from, to, type });
}

function resolveLinkedNode(context: GraphBuildContext, currentFile: string, token: string): DirectedGraphNode | null {
  const stripped = token.split('?')[0]?.split('#')[0]?.trim() ?? token.trim();
  if (!stripped) return null;

  const candidates: string[] = [];
  if (isAbsolute(stripped)) {
    candidates.push(stripped);
    const withoutRoot = stripped.replace(/^\/+/, '');
    if (withoutRoot.length > 0) {
      candidates.push(resolve(context.plansPath, withoutRoot));
      if (withoutRoot.toLowerCase().startsWith('plans/')) {
        candidates.push(resolve(context.plansPath, withoutRoot.slice('plans/'.length)));
      }
    }
  } else {
    candidates.push(resolve(dirname(currentFile), stripped));
    candidates.push(resolve(context.plansPath, stripped));
  }

  for (const candidate of candidates) {
    const normalized = normalizePath(candidate);
    const nodeByExactPath = context.nodeByPath.get(normalized);
    if (nodeByExactPath) return nodeByExactPath;

    for (const ext of ['', '.md', '.agent.md', '.canvas', '.base']) {
      const byExt = context.nodeByPath.get(normalizePath(`${candidate}${ext}`));
      if (byExt) return byExt;
    }
  }

  const stem = basename(stripped, extname(stripped));
  const byStem = context.nodesByStem.get(stem);
  if (byStem && byStem.length === 1) {
    return byStem[0] ?? null;
  }

  return null;
}

function resolveAgentDependency(context: GraphBuildContext, currentNode: DirectedGraphNode, token: string): DirectedGraphNode | null {
  const normalized = token.trim().replace(/^['"]|['"]$/g, '');
  if (!normalized) return null;

  if (/^\d{1,3}$/.test(normalized)) {
    const number = normalized.padStart(3, '0');
    const candidates = context.agentsByNumber.get(number) ?? [];
    if (candidates.length === 0) return null;
    const samePlan = candidates.find((node) => node.planId === currentNode.planId);
    return samePlan ?? candidates[0] ?? null;
  }

  if (/^\d{4}#\d{3}$/.test(normalized)) {
    const candidates = context.agentsByNumber.get(normalized.slice(-3)) ?? [];
    if (candidates.length === 0) return null;
    const samePlan = candidates.find((node) => node.planId === currentNode.planId);
    return samePlan ?? candidates[0] ?? null;
  }

  return resolveLinkedNode(context, currentNode.filePath, normalized);
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

      if (!inStack.has(next)) continue;

      const cycleStart = stack.lastIndexOf(next);
      if (cycleStart === -1) continue;

      const cycleNodeIds = stack.slice(cycleStart);
      const signature = [...cycleNodeIds].sort().join('|');
      if (seenSignatures.has(signature)) continue;

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
  const files = walkFiles(plansPath);

  const nodes: DirectedGraphNode[] = [];
  const nodeByPath = new Map<string, DirectedGraphNode>();
  const nodeById = new Map<string, DirectedGraphNode>();
  const nodesByStem = new Map<string, DirectedGraphNode[]>();
  const agentsByNumber = new Map<string, DirectedGraphNode[]>();
  const warnings: string[] = [];

  for (const filePath of files) {
    const type = classifyNodeType(filePath);
    const normalizedPath = normalizePath(filePath);
    const node: DirectedGraphNode = {
      id: `${type}:${normalizedPath}`,
      type,
      label: labelForNode(filePath, type),
      filePath,
      planId: planIdForPath(plansPath, filePath),
    };

    nodes.push(node);
    nodeByPath.set(normalizedPath, node);
    nodeById.set(node.id, node);

    const stem = basename(filePath, extname(filePath));
    if (!nodesByStem.has(stem)) nodesByStem.set(stem, []);
    nodesByStem.get(stem)?.push(node);

    if (type === 'agent') {
      const number = getAgentNumberFromFilename(basename(filePath));
      if (number) {
        if (!agentsByNumber.has(number)) agentsByNumber.set(number, []);
        agentsByNumber.get(number)?.push(node);
      }
    }
  }

  const context: GraphBuildContext = {
    plansPath,
    nodeByPath,
    nodesByStem,
    agentsByNumber,
    edges: [],
    edgeSet: new Set<string>(),
    warnings,
  };

  const planNodeByPlanId = new Map<string, DirectedGraphNode>();
  for (const node of nodes) {
    if (node.type === 'plan' && !planNodeByPlanId.has(node.planId)) {
      planNodeByPlanId.set(node.planId, node);
    }
  }

  for (const node of nodes) {
    if (node.type === 'plan') continue;
    const planNode = planNodeByPlanId.get(node.planId);
    if (!planNode) continue;

    if (node.type === 'agent') {
      addEdge(context, planNode.id, node.id, 'plan-contains');
    } else if (node.type === 'canvas') {
      addEdge(context, planNode.id, node.id, 'related-canvas');
    } else if (node.type === 'base') {
      addEdge(context, planNode.id, node.id, 'related-base');
    } else {
      addEdge(context, planNode.id, node.id, 'related-doc');
    }
  }

  const tagToNodes = new Map<string, string[]>();

  for (const node of nodes) {
    const isMarkdownLike = node.type === 'agent' || node.type === 'plan' || node.type === 'doc' || node.type === 'roadmap';
    if (!isMarkdownLike) continue;

    let raw: string;
    try {
      raw = readFileSync(node.filePath, 'utf8');
    } catch {
      warnings.push(`Failed reading ${node.filePath}`);
      continue;
    }

    const sections = parseFrontmatterSections(raw);
    const combinedText = `${sections.frontmatter ?? ''}\n${sections.body}`;

    if (node.type === 'agent') {
      for (const dep of parseDependsOn(sections.frontmatter)) {
        const resolved = resolveAgentDependency(context, node, dep);
        if (!resolved || resolved.type !== 'agent') {
          warnings.push(`Unresolved depends_on '${dep}' in ${basename(node.filePath)}`);
          continue;
        }
        addEdge(context, node.id, resolved.id, 'depends-on');
      }

      for (const blockedAgent of parseBlocks(sections.frontmatter)) {
        const resolved = resolveAgentDependency(context, node, blockedAgent);
        if (!resolved || resolved.type !== 'agent') {
          warnings.push(`Unresolved blocks '${blockedAgent}' in ${basename(node.filePath)}`);
          continue;
        }
        // Canonicalize "A blocks B" as "B depends-on A" to keep one directed relation type.
        addEdge(context, resolved.id, node.id, 'depends-on');
      }
    }

    for (const linkToken of parseMarkdownLinks(combinedText)) {
      if (isExternalReference(linkToken)) {
        continue;
      }
      if (isDirectoryLikeReference(linkToken) || isPlaceholderReference(linkToken)) {
        continue;
      }
      const linkedNode = resolveLinkedNode(context, node.filePath, linkToken);
      if (!linkedNode) {
        warnings.push(`Unresolved link '${linkToken}' in ${basename(node.filePath)}`);
        continue;
      }
      if (linkedNode.id === node.id) continue;
      addEdge(context, node.id, linkedNode.id, 'references');
    }

    for (const tag of parseTags(sections.frontmatter)) {
      if (!tagToNodes.has(tag)) tagToNodes.set(tag, []);
      tagToNodes.get(tag)?.push(node.id);
    }
  }

  for (const nodeIds of tagToNodes.values()) {
    const unique = Array.from(new Set(nodeIds));
    if (unique.length < 2) continue;
    const anchor = unique[0];
    for (let index = 1; index < Math.min(unique.length, 30); index++) {
      const target = unique[index];
      if (!target) continue;
      addEdge(context, anchor, target, 'semantic-tag');
    }
  }

  const cycles = detectCycles(nodes, context.edges);
  const unresolvedRelations = warnings.filter((warning) => warning.startsWith('Unresolved')).length;

  return {
    nodes,
    edges: context.edges,
    warnings,
    cycles,
    stats: {
      plans: nodes.filter((node) => node.type === 'plan').length,
      agents: nodes.filter((node) => node.type === 'agent').length,
      docs: nodes.filter((node) => node.type === 'doc').length,
      roadmap: nodes.filter((node) => node.type === 'roadmap').length,
      canvas: nodes.filter((node) => node.type === 'canvas').length,
      base: nodes.filter((node) => node.type === 'base').length,
      edges: context.edges.length,
      referenceEdges: context.edges.filter((edge) => edge.type === 'references').length,
      semanticEdges: context.edges.filter((edge) => edge.type === 'semantic-tag').length,
      unresolvedRelations,
      isolatedAgents: countIsolatedAgents(nodes, context.edges),
    },
  };
}
