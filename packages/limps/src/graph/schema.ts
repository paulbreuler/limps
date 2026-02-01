import type { Database as DatabaseType } from 'better-sqlite3';
import { ENTITY_TYPES, RELATION_TYPES } from './types.js';

const entityTypeList = ENTITY_TYPES.map((type) => `'${type}'`).join(', ');
const relationTypeList = RELATION_TYPES.map((type) => `'${type}'`).join(', ');

export const SCHEMA_SQL = `
-- Entities table
CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN (${entityTypeList})),
  canonical_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source_path TEXT,
  content_hash TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(type, canonical_id)
);

-- Relationships table
CREATE TABLE IF NOT EXISTS relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK(relation_type IN (${relationTypeList})),
  confidence REAL DEFAULT 1.0,
  metadata TEXT DEFAULT '{}',
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
  INSERT INTO entities_fts(rowid, canonical_id, name)
  VALUES (new.id, new.canonical_id, new.name);
END;

CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, canonical_id, name)
  VALUES ('delete', old.id, old.canonical_id, old.name);
END;

CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, canonical_id, name)
  VALUES ('delete', old.id, old.canonical_id, old.name);
  INSERT INTO entities_fts(rowid, canonical_id, name)
  VALUES (new.id, new.canonical_id, new.name);
END;

-- Graph metadata table
CREATE TABLE IF NOT EXISTS graph_meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
`;

export function createGraphSchema(db: DatabaseType): void {
  db.exec(SCHEMA_SQL);
}
