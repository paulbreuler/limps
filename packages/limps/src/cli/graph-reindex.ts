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

  for (const planDir of planDirs) {
    const extraction: ExtractionResult = extractor.extractPlan(planDir);
    result.warnings.push(...extraction.warnings);

    if (extraction.entities.length > 0) {
      result.entitiesUpserted += storage.bulkUpsertEntities(extraction.entities);
    }
    if (extraction.relationships.length > 0) {
      result.relationshipsUpserted += storage.bulkUpsertRelationships(extraction.relationships);
    }
    result.plansProcessed++;
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
