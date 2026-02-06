import type { Entity, Relationship } from './types.js';
import type { GraphStorage } from './storage.js';

export type ConflictSeverity = 'warning' | 'error';

export type ConflictType =
  | 'file_contention'
  | 'feature_overlap'
  | 'circular_dependency'
  | 'stale_wip';

export interface ConflictReport {
  type: ConflictType;
  severity: ConflictSeverity;
  message: string;
  entities: string[];
  metadata?: Record<string, unknown>;
}

export interface ConflictDetectorOptions {
  staleWarningDays?: number;
  staleErrorDays?: number;
  overlapThreshold?: number;
}

const DEFAULT_OPTIONS: Required<ConflictDetectorOptions> = {
  staleWarningDays: 7,
  staleErrorDays: 14,
  overlapThreshold: 0.85,
};

export class ConflictDetector {
  private readonly opts: Required<ConflictDetectorOptions>;

  constructor(
    private readonly storage: GraphStorage,
    options?: ConflictDetectorOptions
  ) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
  }

  detectAll(): ConflictReport[] {
    return [
      ...this.detectFileContention(),
      ...this.detectFeatureOverlap(),
      ...this.detectCircularDependencies(),
      ...this.detectStaleWip(),
    ];
  }

  detectFileContention(): ConflictReport[] {
    const reports: ConflictReport[] = [];
    const modifiesRels = this.storage.getRelationshipsByType('MODIFIES');

    // Group by target (file entity)
    const fileToSources = new Map<number, Relationship[]>();
    for (const rel of modifiesRels) {
      const existing = fileToSources.get(rel.targetId) ?? [];
      existing.push(rel);
      fileToSources.set(rel.targetId, existing);
    }

    for (const [fileId, rels] of fileToSources) {
      if (rels.length < 2) continue;

      // Filter to only WIP agents
      const wipSources: Entity[] = [];
      for (const rel of rels) {
        const source = this.storage.getEntity(this.getCanonicalById(rel.sourceId));
        if (source?.metadata?.status === 'WIP') {
          wipSources.push(source);
        }
      }

      if (wipSources.length < 2) continue;

      const fileEntity = this.storage.getEntity(this.getCanonicalById(fileId));
      const fileName = fileEntity?.name ?? `entity:${fileId}`;

      reports.push({
        type: 'file_contention',
        severity: 'error',
        message: `File "${fileName}" is modified by ${wipSources.length} WIP agents: ${wipSources.map((e) => e.canonicalId).join(', ')}`,
        entities: [fileName, ...wipSources.map((e) => e.canonicalId)],
        metadata: { fileId: fileEntity?.canonicalId, agentCount: wipSources.length },
      });
    }

    return reports;
  }

  detectFeatureOverlap(): ConflictReport[] {
    const reports: ConflictReport[] = [];
    const similarRels = this.storage.getRelationshipsByType('SIMILAR_TO');

    for (const rel of similarRels) {
      if (rel.confidence < this.opts.overlapThreshold) continue;

      const source = this.storage.getEntity(this.getCanonicalById(rel.sourceId));
      const target = this.storage.getEntity(this.getCanonicalById(rel.targetId));
      if (!source || !target) continue;

      reports.push({
        type: 'feature_overlap',
        severity: 'warning',
        message: `Features "${source.name}" and "${target.name}" are ${(rel.confidence * 100).toFixed(0)}% similar`,
        entities: [source.canonicalId, target.canonicalId],
        metadata: { confidence: rel.confidence },
      });
    }

    return reports;
  }

  detectCircularDependencies(): ConflictReport[] {
    const reports: ConflictReport[] = [];
    const dependsRels = this.storage.getRelationshipsByType('DEPENDS_ON');

    // Build adjacency list
    const adjacency = new Map<number, number[]>();
    for (const rel of dependsRels) {
      const existing = adjacency.get(rel.sourceId) ?? [];
      existing.push(rel.targetId);
      adjacency.set(rel.sourceId, existing);
    }

    // DFS cycle detection
    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map<number, number>();
    const parent = new Map<number, number>();
    const reportedCycles = new Set<string>();

    const dfs = (node: number, path: number[]): void => {
      color.set(node, GRAY);

      for (const neighbor of adjacency.get(node) ?? []) {
        if (color.get(neighbor) === GRAY) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          const cycle =
            cycleStart >= 0 ? path.slice(cycleStart).concat(neighbor) : [node, neighbor];

          const cycleIds = cycle.map((id) => this.getCanonicalById(id));
          const key = [...cycleIds].sort().join('|');
          if (!reportedCycles.has(key)) {
            reportedCycles.add(key);
            reports.push({
              type: 'circular_dependency',
              severity: 'error',
              message: `Circular dependency detected: ${cycleIds.join(' -> ')}`,
              entities: cycleIds,
            });
          }
        } else if (color.get(neighbor) !== BLACK) {
          parent.set(neighbor, node);
          dfs(neighbor, [...path, neighbor]);
        }
      }

      color.set(node, BLACK);
    };

    for (const node of adjacency.keys()) {
      if ((color.get(node) ?? WHITE) === WHITE) {
        dfs(node, [node]);
      }
    }

    return reports;
  }

  detectStaleWip(): ConflictReport[] {
    const reports: ConflictReport[] = [];
    const agents = this.storage.getEntitiesByType('agent');
    const now = Date.now();

    for (const agent of agents) {
      if (agent.metadata?.status !== 'WIP') continue;

      const updatedAt = new Date(agent.updatedAt).getTime();
      const daysSinceUpdate = (now - updatedAt) / (1000 * 60 * 60 * 24);

      if (daysSinceUpdate >= this.opts.staleErrorDays) {
        reports.push({
          type: 'stale_wip',
          severity: 'error',
          message: `Agent "${agent.name}" (${agent.canonicalId}) has been WIP for ${Math.floor(daysSinceUpdate)} days`,
          entities: [agent.canonicalId],
          metadata: { daysSinceUpdate: Math.floor(daysSinceUpdate) },
        });
      } else if (daysSinceUpdate >= this.opts.staleWarningDays) {
        reports.push({
          type: 'stale_wip',
          severity: 'warning',
          message: `Agent "${agent.name}" (${agent.canonicalId}) has been WIP for ${Math.floor(daysSinceUpdate)} days`,
          entities: [agent.canonicalId],
          metadata: { daysSinceUpdate: Math.floor(daysSinceUpdate) },
        });
      }
    }

    return reports;
  }

  private getCanonicalById(entityId: number): string {
    const entities = this.storage
      .getEntitiesByType('plan')
      .concat(this.storage.getEntitiesByType('agent'))
      .concat(this.storage.getEntitiesByType('feature'))
      .concat(this.storage.getEntitiesByType('file'))
      .concat(this.storage.getEntitiesByType('tag'))
      .concat(this.storage.getEntitiesByType('concept'));

    const entity = entities.find((e) => e.id === entityId);
    return entity?.canonicalId ?? `unknown:${entityId}`;
  }
}
