---
title: Entity Schema & Storage
status: PASS
persona: coder
depends_on: []
files: [src/graph/schema.ts, src/graph/storage.ts, src/graph/types.ts]
tags: [foundation, sqlite, schema]
---

# Agent 000: Entity Schema & Storage

## Objective

Define entity and relationship types in TypeScript. Implement SQLite storage layer with efficient indexing.

## Context

This is the foundation for the entire knowledge graph. All other agents depend on this schema being stable and well-designed.

**Key principle**: Schema should support deterministic queries (exact lookups) as well as graph traversal. No LLM reasoning happens at this layer.

## Tasks

### 1. Define TypeScript Types (`src/graph/types.ts`)

```typescript
export type EntityType = 'plan' | 'agent' | 'feature' | 'file' | 'tag' | 'concept';

export interface Entity {
  id: number;
  type: EntityType;
  canonicalId: string;  // e.g., "plan:0042", "agent:0042#003", "file:src/auth.ts"
  name: string;
  sourcePath?: string;  // Original markdown file
  contentHash?: string; // For change detection
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type RelationType = 
  | 'CONTAINS'      // plan → agent, plan → feature
  | 'DEPENDS_ON'    // agent → agent
  | 'MODIFIES'      // agent → file
  | 'IMPLEMENTS'    // agent → feature
  | 'SIMILAR_TO'    // feature → feature (with confidence)
  | 'BLOCKS'        // derived: inverse of DEPENDS_ON
  | 'TAGGED_WITH';  // entity → tag

export interface Relationship {
  id: number;
  sourceId: number;
  targetId: number;
  relationType: RelationType;
  confidence: number;  // 0-1, used for SIMILAR_TO
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface GraphStats {
  entityCounts: Record<EntityType, number>;
  relationCounts: Record<RelationType, number>;
  totalEntities: number;
  totalRelations: number;
  lastIndexed: string;
}
```

### 2. SQLite Schema (`src/graph/schema.ts`)

```typescript
export const SCHEMA_SQL = `
-- Entities table
CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('plan', 'agent', 'feature', 'file', 'tag', 'concept')),
  canonical_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source_path TEXT,
  content_hash TEXT,
  metadata JSON DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(type, canonical_id)
);

-- Relationships table
CREATE TABLE IF NOT EXISTS relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  metadata JSON DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(source_id, target_id, relation_type)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_canonical ON entities(canonical_id);
CREATE INDEX IF NOT EXISTS idx_entities_source ON entities(source_path);
CREATE INDEX IF NOT EXISTS idx_entities_hash ON entities(content_hash);

CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_id);
CREATE INDEX IF NOT EXISTS idx_rel_type ON relationships(relation_type);

-- Full-text search on entity names (for lexical retrieval)
CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
  canonical_id,
  name,
  content='entities',
  content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
  INSERT INTO entities_fts(rowid, canonical_id, name) VALUES (new.id, new.canonical_id, new.name);
END;

CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, canonical_id, name) VALUES('delete', old.id, old.canonical_id, old.name);
END;

CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, canonical_id, name) VALUES('delete', old.id, old.canonical_id, old.name);
  INSERT INTO entities_fts(rowid, canonical_id, name) VALUES (new.id, new.canonical_id, new.name);
END;

-- Graph metadata table
CREATE TABLE IF NOT EXISTS graph_meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
`;
```

### 3. Storage Operations (`src/graph/storage.ts`)

```typescript
export class GraphStorage {
  constructor(private db: Database) {}
  
  // Entity CRUD
  upsertEntity(entity: Omit<Entity, 'id' | 'createdAt' | 'updatedAt'>): Entity;
  getEntity(canonicalId: string): Entity | null;
  getEntitiesByType(type: EntityType): Entity[];
  getEntitiesBySource(sourcePath: string): Entity[];
  deleteEntity(canonicalId: string): boolean;
  
  // Relationship CRUD
  upsertRelationship(rel: Omit<Relationship, 'id' | 'createdAt'>): Relationship;
  getRelationships(entityId: number, direction: 'outgoing' | 'incoming' | 'both'): Relationship[];
  getRelationshipsByType(type: RelationType): Relationship[];
  deleteRelationship(sourceId: number, targetId: number, type: RelationType): boolean;
  
  // Graph traversal (1-hop, deterministic)
  getNeighbors(entityId: number, relationType?: RelationType): Entity[];
  getPath(fromId: number, toId: number, maxDepth: number): Entity[][] | null;
  
  // Bulk operations (for reindexing)
  bulkUpsertEntities(entities: Entity[]): number;
  bulkUpsertRelationships(rels: Relationship[]): number;
  deleteEntitiesBySource(sourcePath: string): number;
  
  // Stats
  getStats(): GraphStats;
  
  // FTS search (for lexical retrieval)
  searchEntities(query: string, limit: number): Entity[];
}
```

### 4. Change Detection

```typescript
// For incremental reindexing
export function computeContentHash(content: string): string {
  // Use fast hash (xxhash or similar)
  return xxhash(content).toString(16);
}

export function hasChanged(sourcePath: string, currentHash: string): boolean {
  const existing = storage.getEntitiesBySource(sourcePath);
  if (existing.length === 0) return true;
  return existing.some(e => e.contentHash !== currentHash);
}
```

## Acceptance Criteria

- [ ] TypeScript types compile with strict mode
- [ ] SQLite schema creates all tables and indexes
- [ ] FTS triggers keep search index in sync
- [ ] CRUD operations work correctly
- [ ] Bulk operations handle 1000+ entities efficiently
- [ ] Change detection identifies modified files
- [ ] All operations are synchronous (no async/await needed for SQLite)

## Testing

```typescript
describe('GraphStorage', () => {
  it('upserts entity and retrieves by canonical ID');
  it('creates relationships between entities');
  it('traverses 1-hop neighbors');
  it('FTS search finds entities by name');
  it('bulk upsert handles duplicates via UPSERT');
  it('delete cascades to relationships');
  it('change detection identifies modified content');
});
```

## Notes

- Use better-sqlite3 for synchronous operations (faster than async for local)
- Schema is additive — never remove columns, only add
- Canonical IDs must be globally unique across types
