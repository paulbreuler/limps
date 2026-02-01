import { createHash } from 'crypto';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { Entity, EntityType, GraphStats, RelationType, Relationship } from './types.js';
import { ENTITY_TYPES, RELATION_TYPES } from './types.js';

interface EntityRow {
  id: number;
  type: EntityType;
  canonical_id: string;
  name: string;
  source_path: string | null;
  content_hash: string | null;
  metadata: string | Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface RelationshipRow {
  id: number;
  source_id: number;
  target_id: number;
  relation_type: RelationType;
  confidence: number;
  metadata: string | Record<string, unknown> | null;
  created_at: string;
}

function resolveEntityType(canonicalId: string, explicitType?: EntityType): EntityType | null {
  if (explicitType) {
    return explicitType;
  }

  const [prefix] = canonicalId.split(':');
  if (prefix && ENTITY_TYPES.includes(prefix as EntityType)) {
    return prefix as EntityType;
  }

  return null;
}

function parseMetadata(value: EntityRow['metadata']): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('GraphStorage.parseMetadata failed; returning empty object.', {
      error: errorMessage,
    });
    return {};
  }
}

function mapEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    type: row.type,
    canonicalId: row.canonical_id,
    name: row.name,
    sourcePath: row.source_path ?? undefined,
    contentHash: row.content_hash ?? undefined,
    metadata: parseMetadata(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRelationship(row: RelationshipRow): Relationship {
  return {
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    relationType: row.relation_type,
    confidence: row.confidence,
    metadata: parseMetadata(row.metadata),
    createdAt: row.created_at,
  };
}

function normalizeTimestamp(value: string | undefined, fallback: string): string {
  return value && value.trim().length > 0 ? value : fallback;
}

export class GraphStorage {
  constructor(private db: DatabaseType) {
    this.db.pragma('foreign_keys = ON');
  }

  upsertEntity(entity: Omit<Entity, 'id' | 'createdAt' | 'updatedAt'>): Entity {
    const now = new Date().toISOString();
    const metadata = JSON.stringify(entity.metadata ?? {});

    this.db
      .prepare(
        `
        INSERT INTO entities (
          type,
          canonical_id,
          name,
          source_path,
          content_hash,
          metadata,
          created_at,
          updated_at
        )
        VALUES (@type, @canonicalId, @name, @sourcePath, @contentHash, @metadata, @createdAt, @updatedAt)
        ON CONFLICT(type, canonical_id) DO UPDATE SET
          name = excluded.name,
          source_path = excluded.source_path,
          content_hash = excluded.content_hash,
          metadata = excluded.metadata,
          updated_at = excluded.updated_at
      `
      )
      .run({
        type: entity.type,
        canonicalId: entity.canonicalId,
        name: entity.name,
        sourcePath: entity.sourcePath ?? null,
        contentHash: entity.contentHash ?? null,
        metadata,
        createdAt: now,
        updatedAt: now,
      });

    const row = this.db
      .prepare('SELECT * FROM entities WHERE type = ? AND canonical_id = ?')
      .get(entity.type, entity.canonicalId) as EntityRow | undefined;

    if (!row) {
      throw new Error(`Failed to upsert entity: ${entity.canonicalId}`);
    }

    return mapEntity(row);
  }

  getEntity(canonicalId: string, type?: EntityType): Entity | null {
    const resolvedType = resolveEntityType(canonicalId, type);
    const row = resolvedType
      ? (this.db
          .prepare('SELECT * FROM entities WHERE type = ? AND canonical_id = ? ORDER BY id LIMIT 1')
          .get(resolvedType, canonicalId) as EntityRow | undefined)
      : (this.db
          .prepare('SELECT * FROM entities WHERE canonical_id = ? ORDER BY id LIMIT 1')
          .get(canonicalId) as EntityRow | undefined);

    return row ? mapEntity(row) : null;
  }

  getEntitiesByType(type: EntityType): Entity[] {
    const rows = this.db.prepare('SELECT * FROM entities WHERE type = ?').all(type) as EntityRow[];
    return rows.map(mapEntity);
  }

  getEntitiesBySource(sourcePath: string): Entity[] {
    const rows = this.db
      .prepare('SELECT * FROM entities WHERE source_path = ?')
      .all(sourcePath) as EntityRow[];
    return rows.map(mapEntity);
  }

  deleteEntity(canonicalId: string, type?: EntityType): boolean {
    const resolvedType = resolveEntityType(canonicalId, type);
    const result = resolvedType
      ? this.db
          .prepare('DELETE FROM entities WHERE type = ? AND canonical_id = ?')
          .run(resolvedType, canonicalId)
      : this.db.prepare('DELETE FROM entities WHERE canonical_id = ?').run(canonicalId);
    return result.changes > 0;
  }

  upsertRelationship(rel: Omit<Relationship, 'id' | 'createdAt'>): Relationship {
    const now = new Date().toISOString();
    const metadata = JSON.stringify(rel.metadata ?? {});

    this.db
      .prepare(
        `
        INSERT INTO relationships (
          source_id,
          target_id,
          relation_type,
          confidence,
          metadata,
          created_at
        )
        VALUES (@sourceId, @targetId, @relationType, @confidence, @metadata, @createdAt)
        ON CONFLICT(source_id, target_id, relation_type) DO UPDATE SET
          confidence = excluded.confidence,
          metadata = excluded.metadata
      `
      )
      .run({
        sourceId: rel.sourceId,
        targetId: rel.targetId,
        relationType: rel.relationType,
        confidence: rel.confidence ?? 1.0,
        metadata,
        createdAt: now,
      });

    const row = this.db
      .prepare(
        'SELECT * FROM relationships WHERE source_id = ? AND target_id = ? AND relation_type = ?'
      )
      .get(rel.sourceId, rel.targetId, rel.relationType) as RelationshipRow | undefined;

    if (!row) {
      throw new Error(
        `Failed to upsert relationship: ${rel.sourceId} -> ${rel.targetId} (${rel.relationType})`
      );
    }

    return mapRelationship(row);
  }

  getRelationships(entityId: number, direction: 'outgoing' | 'incoming' | 'both'): Relationship[] {
    let rows: RelationshipRow[];

    if (direction === 'outgoing') {
      rows = this.db
        .prepare('SELECT * FROM relationships WHERE source_id = ?')
        .all(entityId) as RelationshipRow[];
    } else if (direction === 'incoming') {
      rows = this.db
        .prepare('SELECT * FROM relationships WHERE target_id = ?')
        .all(entityId) as RelationshipRow[];
    } else {
      rows = this.db
        .prepare('SELECT * FROM relationships WHERE source_id = ? OR target_id = ?')
        .all(entityId, entityId) as RelationshipRow[];
    }

    return rows.map(mapRelationship);
  }

  getRelationshipsByType(type: RelationType): Relationship[] {
    const rows = this.db
      .prepare('SELECT * FROM relationships WHERE relation_type = ?')
      .all(type) as RelationshipRow[];
    return rows.map(mapRelationship);
  }

  deleteRelationship(sourceId: number, targetId: number, type: RelationType): boolean {
    const result = this.db
      .prepare(
        'DELETE FROM relationships WHERE source_id = ? AND target_id = ? AND relation_type = ?'
      )
      .run(sourceId, targetId, type);
    return result.changes > 0;
  }

  getNeighbors(entityId: number, relationType?: RelationType): Entity[] {
    if (relationType) {
      const rows = this.db
        .prepare(
          `
          SELECT e.*
          FROM relationships r
          JOIN entities e ON e.id = r.target_id
          WHERE r.source_id = ? AND r.relation_type = ?
        `
        )
        .all(entityId, relationType) as EntityRow[];
      return rows.map(mapEntity);
    }

    const rows = this.db
      .prepare(
        `
        SELECT e.*
        FROM relationships r
        JOIN entities e ON e.id = r.target_id
        WHERE r.source_id = ?
      `
      )
      .all(entityId) as EntityRow[];

    return rows.map(mapEntity);
  }

  getPath(fromId: number, toId: number, maxDepth: number, maxPaths = 25): Entity[][] | null {
    if (maxDepth < 1) {
      return null;
    }

    const boundedDepth = Math.min(maxDepth, 10);
    const boundedPaths = Math.max(1, Math.min(maxPaths, 1000));
    const start = this.getEntityById(fromId);
    const target = this.getEntityById(toId);

    if (!start || !target) {
      return null;
    }

    if (fromId === toId) {
      return [[start]];
    }

    const results: Entity[][] = [];
    const queue: Entity[][] = [[start]];
    let head = 0;

    while (head < queue.length) {
      const path = queue[head++];
      if (!path) {
        continue;
      }

      const last = path[path.length - 1];
      if (!last) {
        continue;
      }

      const depth = path.length - 1;
      if (depth >= boundedDepth) {
        continue;
      }

      const neighbors = this.getNeighbors(last.id);
      for (const neighbor of neighbors) {
        if (path.some((node) => node.id === neighbor.id)) {
          continue;
        }

        const nextPath = [...path, neighbor];
        if (neighbor.id === toId) {
          results.push(nextPath);
          if (results.length >= boundedPaths) {
            return results;
          }
        } else {
          queue.push(nextPath);
        }
      }
    }

    return results.length > 0 ? results : null;
  }

  bulkUpsertEntities(entities: Entity[]): number {
    if (entities.length === 0) {
      return 0;
    }

    const now = new Date().toISOString();
    const statement = this.db.prepare(
      `
      INSERT INTO entities (
        type,
        canonical_id,
        name,
        source_path,
        content_hash,
        metadata,
        created_at,
        updated_at
      )
      VALUES (@type, @canonicalId, @name, @sourcePath, @contentHash, @metadata, @createdAt, @updatedAt)
      ON CONFLICT(type, canonical_id) DO UPDATE SET
        name = excluded.name,
        source_path = excluded.source_path,
        content_hash = excluded.content_hash,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `
    );

    const transaction = this.db.transaction((rows: Entity[]) => {
      let changes = 0;
      for (const entity of rows) {
        const result = statement.run({
          type: entity.type,
          canonicalId: entity.canonicalId,
          name: entity.name,
          sourcePath: entity.sourcePath ?? null,
          contentHash: entity.contentHash ?? null,
          metadata: JSON.stringify(entity.metadata ?? {}),
          createdAt: normalizeTimestamp(entity.createdAt, now),
          updatedAt: normalizeTimestamp(entity.updatedAt, now),
        });
        changes += result.changes;
      }
      return changes;
    });

    return transaction(entities);
  }

  bulkUpsertRelationships(rels: Relationship[]): number {
    if (rels.length === 0) {
      return 0;
    }

    const now = new Date().toISOString();
    const statement = this.db.prepare(
      `
      INSERT INTO relationships (
        source_id,
        target_id,
        relation_type,
        confidence,
        metadata,
        created_at
      )
      VALUES (@sourceId, @targetId, @relationType, @confidence, @metadata, @createdAt)
      ON CONFLICT(source_id, target_id, relation_type) DO UPDATE SET
        confidence = excluded.confidence,
        metadata = excluded.metadata
    `
    );

    const transaction = this.db.transaction((rows: Relationship[]) => {
      let changes = 0;
      for (const rel of rows) {
        const result = statement.run({
          sourceId: rel.sourceId,
          targetId: rel.targetId,
          relationType: rel.relationType,
          confidence: rel.confidence ?? 1.0,
          metadata: JSON.stringify(rel.metadata ?? {}),
          createdAt: normalizeTimestamp(rel.createdAt, now),
        });
        changes += result.changes;
      }
      return changes;
    });

    return transaction(rels);
  }

  deleteEntitiesBySource(sourcePath: string): number {
    const result = this.db.prepare('DELETE FROM entities WHERE source_path = ?').run(sourcePath);
    return result.changes;
  }

  getStats(): GraphStats {
    const entityCounts: Record<EntityType, number> = {
      plan: 0,
      agent: 0,
      feature: 0,
      file: 0,
      tag: 0,
      concept: 0,
    };

    const relationCounts: Record<RelationType, number> = {
      CONTAINS: 0,
      DEPENDS_ON: 0,
      MODIFIES: 0,
      IMPLEMENTS: 0,
      SIMILAR_TO: 0,
      BLOCKS: 0,
      TAGGED_WITH: 0,
    };

    const entityRows = this.db
      .prepare('SELECT type, COUNT(*) as count FROM entities GROUP BY type')
      .all() as { type: EntityType; count: number }[];

    for (const row of entityRows) {
      if (ENTITY_TYPES.includes(row.type)) {
        entityCounts[row.type] = row.count;
      }
    }

    const relationRows = this.db
      .prepare(
        'SELECT relation_type as type, COUNT(*) as count FROM relationships GROUP BY relation_type'
      )
      .all() as { type: RelationType; count: number }[];

    for (const row of relationRows) {
      if (RELATION_TYPES.includes(row.type)) {
        relationCounts[row.type] = row.count;
      }
    }

    const totalEntitiesRow = this.db.prepare('SELECT COUNT(*) as count FROM entities').get() as {
      count: number;
    };
    const totalRelationsRow = this.db
      .prepare('SELECT COUNT(*) as count FROM relationships')
      .get() as {
      count: number;
    };

    const lastIndexedRow = this.db
      .prepare("SELECT value FROM graph_meta WHERE key = 'last_indexed'")
      .get() as { value: string } | undefined;

    return {
      entityCounts,
      relationCounts,
      totalEntities: totalEntitiesRow?.count ?? 0,
      totalRelations: totalRelationsRow?.count ?? 0,
      lastIndexed: lastIndexedRow?.value ?? '',
    };
  }

  searchEntities(query: string, limit: number): Entity[] {
    const safeLimit = Math.max(1, Math.min(limit, 1000));
    try {
      const rows = this.db
        .prepare(
          `
          SELECT e.*
          FROM entities e
          JOIN entities_fts ON entities_fts.rowid = e.id
          WHERE entities_fts MATCH ?
          ORDER BY bm25(entities_fts)
          LIMIT ?
        `
        )
        .all(query, safeLimit) as EntityRow[];

      return rows.map(mapEntity);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('GraphStorage.searchEntities failed; returning empty results.', {
        error: errorMessage,
      });
      return [];
    }
  }

  private getEntityById(id: number): Entity | null {
    const row = this.db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as
      | EntityRow
      | undefined;
    return row ? mapEntity(row) : null;
  }
}

export function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function hasChanged(
  storage: GraphStorage,
  sourcePath: string,
  currentHash: string
): boolean {
  const existing = storage.getEntitiesBySource(sourcePath);
  if (existing.length === 0) {
    return true;
  }

  return existing.some((entity) => !entity.contentHash || entity.contentHash !== currentHash);
}
