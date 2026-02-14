/**
 * LinkAnalyzer: PageRank-based importance scoring for documents in the graph.
 *
 * Uses the REFERENCES relationships to compute document importance.
 * Documents that are referenced by many other documents score higher.
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import { GraphStorage } from '../graph/storage.js';
import type { Entity, Relationship } from '../graph/types.js';

export interface PageRankResult {
  /** Entity canonical ID */
  entityId: string;
  /** Entity name */
  name: string;
  /** PageRank score (0-1, normalized) */
  score: number;
  /** Number of incoming references */
  inDegree: number;
  /** Number of outgoing references */
  outDegree: number;
  /** Entity type */
  type: string;
}

export interface HubDocumentResult {
  /** Top hub documents ranked by PageRank */
  hubs: PageRankResult[];
  /** Total documents analyzed */
  totalDocuments: number;
  /** Total reference edges used */
  totalReferences: number;
}

/**
 * Compute PageRank scores for entities in the graph.
 *
 * @param entities - All entities to score
 * @param relationships - All relationships (filtered to REFERENCES for link analysis)
 * @param damping - Damping factor (default 0.85)
 * @param iterations - Number of iterations (default 20)
 * @returns Map of entity ID to PageRank score
 */
export function computePageRank(
  entities: Entity[],
  relationships: Relationship[],
  damping = 0.85,
  iterations = 20
): Map<number, number> {
  const n = entities.length;
  if (n === 0) return new Map();

  const scores = new Map<number, number>();
  const outDegree = new Map<number, number>();

  // Build adjacency: source -> targets[]
  const outgoing = new Map<number, number[]>();
  const entityIds = new Set(entities.map((e) => e.id));

  for (const entity of entities) {
    scores.set(entity.id, 1 / n);
    outDegree.set(entity.id, 0);
    outgoing.set(entity.id, []);
  }

  for (const rel of relationships) {
    if (!entityIds.has(rel.sourceId) || !entityIds.has(rel.targetId)) continue;
    const targets = outgoing.get(rel.sourceId);
    if (targets) {
      targets.push(rel.targetId);
      outDegree.set(rel.sourceId, (outDegree.get(rel.sourceId) ?? 0) + 1);
    }
  }

  // Build reverse adjacency for efficient incoming lookup
  const incoming = new Map<number, number[]>();
  for (const entity of entities) {
    incoming.set(entity.id, []);
  }
  for (const rel of relationships) {
    if (!entityIds.has(rel.sourceId) || !entityIds.has(rel.targetId)) continue;
    const sources = incoming.get(rel.targetId);
    if (sources) {
      sources.push(rel.sourceId);
    }
  }

  // Iterate PageRank
  for (let iter = 0; iter < iterations; iter++) {
    const newScores = new Map<number, number>();
    for (const entity of entities) {
      let sum = 0;
      const incomingNodes = incoming.get(entity.id) ?? [];
      for (const srcId of incomingNodes) {
        const srcOut = outDegree.get(srcId) ?? 1;
        const srcScore = scores.get(srcId) ?? 0;
        sum += srcScore / srcOut;
      }
      newScores.set(entity.id, (1 - damping) / n + damping * sum);
    }
    for (const [id, score] of newScores) {
      scores.set(id, score);
    }
  }

  return scores;
}

export class LinkAnalyzer {
  private storage: GraphStorage;

  constructor(db: DatabaseType) {
    this.storage = new GraphStorage(db);
  }

  /**
   * Find hub documents using PageRank over REFERENCES relationships.
   *
   * @param topK - Number of top results to return (default 10)
   * @returns Hub document results ranked by importance
   */
  findHubDocuments(topK = 10): HubDocumentResult {
    const allEntities = this.storage.getAllEntities();
    const allRelationships = this.storage.getAllRelationships();

    // Filter to REFERENCES relationships for PageRank
    const refRels = allRelationships.filter((r) => r.relationType === 'REFERENCES');

    const scores = computePageRank(allEntities, refRels);

    // Compute in/out degree per entity
    const entityIds = new Set(allEntities.map((e) => e.id));
    const inDegreeMap = new Map<number, number>();
    const outDegreeMap = new Map<number, number>();
    for (const entity of allEntities) {
      inDegreeMap.set(entity.id, 0);
      outDegreeMap.set(entity.id, 0);
    }
    for (const rel of refRels) {
      if (!entityIds.has(rel.sourceId) || !entityIds.has(rel.targetId)) continue;
      inDegreeMap.set(rel.targetId, (inDegreeMap.get(rel.targetId) ?? 0) + 1);
      outDegreeMap.set(rel.sourceId, (outDegreeMap.get(rel.sourceId) ?? 0) + 1);
    }

    // Build results, sorted by score descending
    const results: PageRankResult[] = allEntities
      .map((entity) => ({
        entityId: entity.canonicalId,
        name: entity.name,
        score: scores.get(entity.id) ?? 0,
        inDegree: inDegreeMap.get(entity.id) ?? 0,
        outDegree: outDegreeMap.get(entity.id) ?? 0,
        type: entity.type,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return {
      hubs: results,
      totalDocuments: allEntities.length,
      totalReferences: refRels.length,
    };
  }

  /**
   * Compute PageRank for all entities and return full ranking.
   * Considers all relationship types, not just REFERENCES.
   *
   * @returns Map of entity canonical ID to PageRank score
   */
  computeFullPageRank(): Map<string, number> {
    const allEntities = this.storage.getAllEntities();
    const allRelationships = this.storage.getAllRelationships();

    const scores = computePageRank(allEntities, allRelationships);

    const result = new Map<string, number>();
    for (const entity of allEntities) {
      result.set(entity.canonicalId, scores.get(entity.id) ?? 0);
    }
    return result;
  }
}
