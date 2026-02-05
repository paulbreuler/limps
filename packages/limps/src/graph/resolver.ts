import type { Entity } from './types.js';
import type { GraphStorage } from './storage.js';
import {
  THRESHOLDS,
  computeSimilarity,
  computeStructuralSimilarityFromNeighbors,
  type EmbeddingStore,
  type SimilarityScore,
} from './similarity.js';

export interface ResolutionMatch {
  a: Entity;
  b: Entity;
  score: SimilarityScore;
}

export interface ResolutionResult {
  duplicates: ResolutionMatch[];
  similar: ResolutionMatch[];
  suggestions: string[];
}

function isDuplicate(score: SimilarityScore): boolean {
  if (score.combined >= THRESHOLDS.duplicate) {
    return true;
  }

  // Different canonical IDs can still be duplicates when lexical + semantic signals are near-identical.
  return (
    score.lexical >= THRESHOLDS.duplicateLexical &&
    score.semantic >= THRESHOLDS.duplicateSemantic &&
    score.structural >= THRESHOLDS.duplicateStructural
  );
}

export class EntityResolver {
  constructor(
    private readonly storage: GraphStorage,
    private readonly embeddings: EmbeddingStore
  ) {}

  resolveAll(): ResolutionResult {
    const result: ResolutionResult = { duplicates: [], similar: [], suggestions: [] };
    const features = this.storage.getEntitiesByType('feature');

    for (let i = 0; i < features.length; i++) {
      const featureA = features[i];
      if (!featureA) {
        continue;
      }

      for (let j = i + 1; j < features.length; j++) {
        const featureB = features[j];
        if (!featureB) {
          continue;
        }

        const structural = computeStructuralSimilarityFromNeighbors(
          this.getNeighborCanonicalIds(featureA),
          this.getNeighborCanonicalIds(featureB)
        );
        const score = computeSimilarity(featureA, featureB, this.embeddings, { structural });

        if (isDuplicate(score)) {
          result.duplicates.push({ a: featureA, b: featureB, score });
          this.addSimilarityRelationship(featureA, featureB, score);
          continue;
        }

        if (score.combined >= THRESHOLDS.similar) {
          result.similar.push({ a: featureA, b: featureB, score });
          this.addSimilarityRelationship(featureA, featureB, score);
        }
      }
    }

    for (const match of result.duplicates) {
      result.suggestions.push(
        `DUPLICATE: "${match.a.name}" (${match.a.canonicalId}) and "${match.b.name}" (${match.b.canonicalId}) are ${(match.score.combined * 100).toFixed(0)}% similar. Consider consolidating.`
      );
    }
    for (const match of result.similar) {
      result.suggestions.push(
        `SIMILAR: "${match.a.name}" (${match.a.canonicalId}) and "${match.b.name}" (${match.b.canonicalId}) are ${(match.score.combined * 100).toFixed(0)}% similar. Consider linking or clarifying scope.`
      );
    }

    return result;
  }

  checkNewFeature(name: string, description: string): Entity[] {
    const queryText = `${name} ${description}`.trim();

    if (this.embeddings.embed && this.embeddings.findSimilar) {
      const embedding = this.embeddings.embed(queryText);
      const candidates = this.embeddings.findSimilar(embedding, 10);

      return candidates
        .filter((candidate) => candidate.score >= THRESHOLDS.similar)
        .map((candidate) => this.storage.getEntity(candidate.canonicalId))
        .filter((entity): entity is Entity => entity?.type === 'feature');
    }

    const probe: Entity = {
      id: 0,
      type: 'feature',
      canonicalId: 'feature:new',
      name: name.trim(),
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.storage
      .getEntitiesByType('feature')
      .map((entity) => ({
        entity,
        score: computeSimilarity(probe, entity, this.embeddings, { structural: 0 }),
      }))
      .filter((entry) => entry.score.combined >= THRESHOLDS.similar)
      .map((entry) => entry.entity);
  }

  private getNeighborCanonicalIds(entity: Entity): Set<string> {
    return new Set(this.storage.getNeighbors(entity.id).map((neighbor) => neighbor.canonicalId));
  }

  private addSimilarityRelationship(a: Entity, b: Entity, score: SimilarityScore): void {
    this.storage.upsertRelationship({
      sourceId: a.id,
      targetId: b.id,
      relationType: 'SIMILAR_TO',
      confidence: score.combined,
      metadata: {
        lexical: score.lexical,
        semantic: score.semantic,
        structural: score.structural,
        detectedAt: new Date().toISOString(),
      },
    });
  }
}
