import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import type { ServerConfig } from '../config.js';
import { createGraphSchema } from '../graph/schema.js';

export function openGraphDb(config: ServerConfig): DatabaseType {
  const dbPath = join(config.dataPath, 'graph.sqlite');

  if (!existsSync(config.dataPath)) {
    mkdirSync(config.dataPath, { recursive: true });
  }

  const db = new Database(dbPath);
  createGraphSchema(db);
  return db;
}
