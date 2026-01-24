import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { initializeDatabase, createSchema } from '../src/indexer.js';

describe('database-creation', () => {
  let dbPath: string;
  let db: Database.Database | null = null;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  it('should create database file', () => {
    db = initializeDatabase(dbPath);
    expect(existsSync(dbPath)).toBe(true);
  });

  it('should return Database instance', () => {
    db = initializeDatabase(dbPath);
    expect(db).toBeInstanceOf(Database);
  });

  it('should create documents table', () => {
    db = initializeDatabase(dbPath);
    createSchema(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'")
      .get();

    expect(tables).toBeDefined();
  });

  it('should create FTS5 virtual table', () => {
    db = initializeDatabase(dbPath);
    createSchema(db);

    const ftsTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documents_fts'")
      .get();

    expect(ftsTables).toBeDefined();
  });

  it('should have correct documents table schema', () => {
    db = initializeDatabase(dbPath);
    createSchema(db);

    const schema = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'")
      .get() as { sql: string } | undefined;

    expect(schema?.sql).toContain('path TEXT PRIMARY KEY');
    expect(schema?.sql).toContain('title TEXT');
    expect(schema?.sql).toContain('content TEXT');
    expect(schema?.sql).toContain('modified_at INTEGER');
    expect(schema?.sql).toContain('hash TEXT');
  });

  it('should support transactions', () => {
    db = initializeDatabase(dbPath);
    createSchema(db);

    const transaction = db.transaction(() => {
      db!
        .prepare(
          'INSERT INTO documents (path, title, content, modified_at, hash) VALUES (?, ?, ?, ?, ?)'
        )
        .run('test.md', 'Test', 'Content', Date.now(), 'hash123');
    });

    expect(() => transaction()).not.toThrow();

    const result = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
    expect(result).toBeDefined();
  });
});
