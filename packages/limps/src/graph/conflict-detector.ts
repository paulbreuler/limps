import type { Entity, Relationship } from './types.js';
import type { GraphStorage } from './storage.js';

/**
 * Compute Jaccard similarity between two sets.
 * Returns 0 if both sets are empty.
 */
export function jaccardSimilarity<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export type ConflictSeverity = 'warning' | 'error';

export type ConflictType =
  | 'file_contention'
  | 'feature_overlap'
  | 'circular_dependency'
  | 'stale_wip'
  | 'concept_conflict'
  | 'duplicate_content';

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
  conceptConflictThreshold?: number;
  duplicateContentThreshold?: number;
}

const DEFAULT_OPTIONS: Required<ConflictDetectorOptions> = {
  staleWarningDays: 7,
  staleErrorDays: 14,
  overlapThreshold: 0.85,
  conceptConflictThreshold: 0.7,
  duplicateContentThreshold: 0.9,
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
      ...this.detectConceptConflicts(),
      ...this.detectDuplicateContent(),
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

  detectConceptConflicts(): ConflictReport[] {
    const reports: ConflictReport[] = [];
    const concepts = this.storage.getEntitiesByType('concept');

    // Find concepts that share the same tag connections (similar concept scope)
    for (let i = 0; i < concepts.length; i++) {
      const a = concepts[i];
      if (!a) continue;
      const aRels = this.storage.getRelationships(a.id, 'outgoing');
      const aTags = new Set(
        aRels.filter((r) => r.relationType === 'TAGGED_WITH').map((r) => r.targetId)
      );

      for (let j = i + 1; j < concepts.length; j++) {
        const b = concepts[j];
        if (!b) continue;
        const bRels = this.storage.getRelationships(b.id, 'outgoing');
        const bTags = new Set(
          bRels.filter((r) => r.relationType === 'TAGGED_WITH').map((r) => r.targetId)
        );

        const similarity = jaccardSimilarity(aTags, bTags);
        if (similarity >= this.opts.conceptConflictThreshold && aTags.size > 0) {
          reports.push({
            type: 'concept_conflict',
            severity: 'warning',
            message: `Concepts "${a.name}" and "${b.name}" have ${(similarity * 100).toFixed(0)}% tag overlap - may be redundant`,
            entities: [a.canonicalId, b.canonicalId],
            metadata: { similarity },
          });
        }
      }
    }

    return reports;
  }

  detectDuplicateContent(): ConflictReport[] {
    const reports: ConflictReport[] = [];
    const features = this.storage.getEntitiesByType('feature');

    // Group features that share similar tag sets
    for (let i = 0; i < features.length; i++) {
      const a = features[i];
      if (!a) continue;
      const aRels = this.storage.getRelationships(a.id, 'outgoing');
      const aTags = new Set(
        aRels.filter((r) => r.relationType === 'TAGGED_WITH').map((r) => r.targetId)
      );
      const aFiles = new Set(
        aRels.filter((r) => r.relationType === 'MODIFIES').map((r) => r.targetId)
      );

      for (let j = i + 1; j < features.length; j++) {
        const b = features[j];
        if (!b) continue;
        const bRels = this.storage.getRelationships(b.id, 'outgoing');
        const bTags = new Set(
          bRels.filter((r) => r.relationType === 'TAGGED_WITH').map((r) => r.targetId)
        );
        const bFiles = new Set(
          bRels.filter((r) => r.relationType === 'MODIFIES').map((r) => r.targetId)
        );

        // Check both tag and file overlap
        const tagSim = jaccardSimilarity(aTags, bTags);
        const fileSim = jaccardSimilarity(aFiles, bFiles);
        const combinedSim =
          aTags.size + aFiles.size > 0 && bTags.size + bFiles.size > 0 ? (tagSim + fileSim) / 2 : 0;

        if (combinedSim >= this.opts.duplicateContentThreshold) {
          reports.push({
            type: 'duplicate_content',
            severity: 'warning',
            message: `Features "${a.name}" and "${b.name}" appear to be duplicates (${(combinedSim * 100).toFixed(0)}% similarity)`,
            entities: [a.canonicalId, b.canonicalId],
            metadata: { tagSimilarity: tagSim, fileSimilarity: fileSim },
          });
        }
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
