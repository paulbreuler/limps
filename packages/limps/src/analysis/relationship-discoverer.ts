/**
 * Relationship discovery between entities using Jaccard similarity.
 * Finds potential relationships based on shared tags, files, and concepts.
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import { GraphStorage } from '../graph/storage.js';
import { jaccardSimilarity } from '../graph/conflict-detector.js';

/**
 * A discovered relationship suggestion.
 */
export interface DiscoveredRelationship {
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  confidence: number;
  reason: string;
}

/**
 * Result of relationship discovery.
 */
export interface DiscoveryResult {
  relationships: DiscoveredRelationship[];
}

/**
 * Options for relationship discovery.
 */
export interface DiscoveryOptions {
  minConfidence?: number;
  planId?: string;
}

/**
 * Get the set of related entity IDs for an entity by relation type.
 */
function getRelatedIds(storage: GraphStorage, entityId: number, relationType: string): Set<number> {
  const rels = storage.getRelationships(entityId, 'outgoing');
  return new Set(rels.filter((r) => r.relationType === relationType).map((r) => r.targetId));
}

/**
 * Discover potential relationships between entities using Jaccard similarity.
 * Compares agents and features by their shared tags and modified files.
 *
 * @param db - Database instance
 * @param options - Discovery options
 * @returns Discovery result with suggested relationships
 */
export function discoverRelationships(
  db: DatabaseType,
  options?: DiscoveryOptions
): DiscoveryResult {
  const storage = new GraphStorage(db);
  const minConfidence = options?.minConfidence ?? 0.3;
  const result: DiscoveryResult = { relationships: [] };

  // Get agents and features to compare
  let agents = storage.getEntitiesByType('agent');
  let features = storage.getEntitiesByType('feature');

  // Filter by planId if provided
  if (options?.planId) {
    const planFilter = options.planId;
    agents = agents.filter((a) => a.canonicalId.includes(planFilter));
    features = features.filter((f) => f.canonicalId.includes(planFilter));
  }

  // Compare agents with each other
  const allEntities = [...agents, ...features];
  const seen = new Set<string>();

  for (let i = 0; i < allEntities.length; i++) {
    const a = allEntities[i];
    if (!a) continue;

    const aTags = getRelatedIds(storage, a.id, 'TAGGED_WITH');
    const aFiles = getRelatedIds(storage, a.id, 'MODIFIES');

    // Skip entities with no connections
    if (aTags.size === 0 && aFiles.size === 0) continue;

    for (let j = i + 1; j < allEntities.length; j++) {
      const b = allEntities[j];
      if (!b) continue;

      // Skip if already have a direct relationship
      const existingRels = storage.getRelationships(a.id, 'outgoing');
      if (existingRels.some((r) => r.targetId === b.id)) continue;
      const reverseRels = storage.getRelationships(b.id, 'outgoing');
      if (reverseRels.some((r) => r.targetId === a.id)) continue;

      const bTags = getRelatedIds(storage, b.id, 'TAGGED_WITH');
      const bFiles = getRelatedIds(storage, b.id, 'MODIFIES');

      // Skip if target has no connections
      if (bTags.size === 0 && bFiles.size === 0) continue;

      const tagSim = jaccardSimilarity(aTags, bTags);
      const fileSim = jaccardSimilarity(aFiles, bFiles);

      // Weight file similarity higher since it's more concrete
      const weights = { tag: 0.4, file: 0.6 };
      const hasTags = aTags.size > 0 && bTags.size > 0;
      const hasFiles = aFiles.size > 0 && bFiles.size > 0;

      let confidence: number;
      if (hasTags && hasFiles) {
        confidence = tagSim * weights.tag + fileSim * weights.file;
      } else if (hasFiles) {
        confidence = fileSim;
      } else if (hasTags) {
        confidence = tagSim;
      } else {
        continue;
      }

      if (confidence < minConfidence) continue;

      // Avoid duplicate pairs
      const key = [a.canonicalId, b.canonicalId].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);

      const reasons: string[] = [];
      if (tagSim > 0) reasons.push(`${(tagSim * 100).toFixed(0)}% tag overlap`);
      if (fileSim > 0) reasons.push(`${(fileSim * 100).toFixed(0)}% file overlap`);

      result.relationships.push({
        sourceId: a.canonicalId,
        sourceName: a.name,
        targetId: b.canonicalId,
        targetName: b.name,
        confidence,
        reason: reasons.join(', '),
      });
    }
  }

  // Sort by confidence descending
  result.relationships.sort((a, b) => b.confidence - a.confidence);

  return result;
}
