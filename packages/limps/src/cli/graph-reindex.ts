import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { ServerConfig } from '../config.js';
import { GraphStorage } from '../graph/storage.js';
import { EntityExtractor, type ExtractionResult } from '../graph/extractor.js';

export interface GraphReindexOptions {
  planId?: string;
  incremental?: boolean;
}

export interface GraphReindexResult {
  plansProcessed: number;
  entitiesUpserted: number;
  relationshipsUpserted: number;
  warnings: string[];
}

export function graphReindex(
  config: ServerConfig,
  db: DatabaseType,
  options?: GraphReindexOptions
): GraphReindexResult {
  const storage = new GraphStorage(db);
  const extractor = new EntityExtractor();
  const result: GraphReindexResult = {
    plansProcessed: 0,
    entitiesUpserted: 0,
    relationshipsUpserted: 0,
    warnings: [],
  };

  const planDirs = findPlanDirs(config.plansPath, options?.planId);

  const extractionBatch: {
    extraction: ExtractionResult;
    localIdToCanonical: Map<number, string>;
  }[] = [];
  for (const planDir of planDirs) {
    const extraction = extractor.extractPlan(planDir);
    result.warnings.push(...extraction.warnings);
    const localIdToCanonical = new Map<number, string>();
    for (const entity of extraction.entities) {
      localIdToCanonical.set(entity.id, entity.canonicalId);
    }
    extractionBatch.push({ extraction, localIdToCanonical });
    result.plansProcessed++;
  }

  for (const { extraction } of extractionBatch) {
    if (extraction.entities.length > 0) {
      result.entitiesUpserted += storage.bulkUpsertEntities(extraction.entities);
    }
  }

  const canonicalToDbId = new Map<string, number>();
  for (const { localIdToCanonical } of extractionBatch) {
    for (const canonicalId of localIdToCanonical.values()) {
      if (canonicalToDbId.has(canonicalId)) {
        continue;
      }
      const dbEntity = storage.getEntity(canonicalId);
      if (dbEntity) {
        canonicalToDbId.set(canonicalId, dbEntity.id);
      }
    }
  }

  for (const { extraction, localIdToCanonical } of extractionBatch) {
    if (extraction.relationships.length > 0) {
      const remappedRelationships = extraction.relationships
        .map((rel) => {
          const sourceCanonical = localIdToCanonical.get(rel.sourceId);
          const targetCanonical = localIdToCanonical.get(rel.targetId);

          if (!sourceCanonical || !targetCanonical) {
            return null;
          }

          const dbSourceId = canonicalToDbId.get(sourceCanonical);
          const dbTargetId = canonicalToDbId.get(targetCanonical);

          if (!dbSourceId || !dbTargetId) {
            return null;
          }

          return {
            ...rel,
            sourceId: dbSourceId,
            targetId: dbTargetId,
          };
        })
        .filter((rel): rel is NonNullable<typeof rel> => rel !== null);

      result.relationshipsUpserted += storage.bulkUpsertRelationships(remappedRelationships);
    }
  }

  // Update last_indexed timestamp
  db.prepare(
    "INSERT OR REPLACE INTO graph_meta (key, value, updated_at) VALUES ('last_indexed', ?, datetime('now'))"
  ).run(new Date().toISOString());

  return result;
}

function findPlanDirs(plansPath: string, planIdFilter?: string): string[] {
  if (!existsSync(plansPath)) return [];

  const entries = readdirSync(plansPath, { withFileTypes: true });
  const dirs: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!/^\d{4}/.test(entry.name)) continue;

    if (planIdFilter) {
      const entryId = entry.name.match(/^(\d{4})/)?.[1];
      if (entryId !== planIdFilter && !entry.name.includes(planIdFilter)) continue;
    }

    dirs.push(join(plansPath, entry.name));
  }

  return dirs.sort();
}
