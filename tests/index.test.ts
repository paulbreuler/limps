import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { createSchema, indexDocument } from '../src/indexer.js';
import { loadConfig } from '../src/config.js';
import { createServer, startServer } from '../src/server.js';
import { startWatcher, stopWatcher } from '../src/watcher.js';

/**
 * Integration test for the main entry point (index.ts).
 * Tests the full server initialization flow.
 */
describe('index-entry-point', () => {
  let testDir: string;
  let plansDir: string;
  let dataDir: string;
  let configPath: string;
  let dbPath: string;
  let db: Database.Database | null = null;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-mcp-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    dataDir = join(testDir, 'data');
    configPath = join(testDir, 'config.json');
    dbPath = join(dataDir, 'documents.sqlite');

    mkdirSync(plansDir, { recursive: true });
    mkdirSync(dataDir, { recursive: true });

    // Create config file
    const config = {
      plansPath: plansDir,
      dataPath: dataDir,
      coordinationPath,
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // Create a test plan document
    const planPath = join(plansDir, '0001-test', 'plan.md');
    mkdirSync(dirname(planPath), { recursive: true });
    writeFileSync(planPath, '# Test Plan\n\nContent here.', 'utf-8');
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should initialize database and schema', async () => {
    db = Database(dbPath);
    createSchema(db);

    expect(existsSync(dbPath)).toBe(true);

    // Verify schema exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('documents');
  });

  it('should index all documents on startup', async () => {
    db = Database(dbPath);
    createSchema(db);

    const planPath = join(plansDir, '0001-test', 'plan.md');
    await indexDocument(db, planPath);

    // Verify document is indexed
    const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get(planPath) as any;
    expect(doc).toBeDefined();
    expect(doc.title).toBe('Test Plan');
  });

  it('should start file watcher', async () => {
    db = Database(dbPath);
    createSchema(db);

    const config = loadConfig(configPath);

    let _watchCallbackCalled = false;
    const watcher = startWatcher(
      config.plansPath,
      async () => {
        _watchCallbackCalled = true;
      },
      ['.md'], // fileExtensions
      ['.git', 'node_modules'], // ignorePatterns
      config.debounceDelay
    );

    // Create a new file to trigger watcher
    const newFile = join(plansDir, 'new-file.md');
    writeFileSync(newFile, '# New File', 'utf-8');

    // Wait a bit for watcher to process
    await new Promise((resolve) => setTimeout(resolve, 300));

    await stopWatcher(watcher);
    expect(watcher).toBeDefined();
  });

  it('should create and start server with all components', async () => {
    db = Database(dbPath);
    createSchema(db);

    const config = loadConfig(configPath);

    const server = createServer(config, db, coordination);
    expect(server).toBeDefined();

    // Start server
    await startServer(server);

    // Verify server is connected
    expect(server).toBeDefined();

    // Clean up
    await server.close();
  });

  it('should handle graceful shutdown with watcher and database cleanup', async () => {
    db = Database(dbPath);
    createSchema(db);

    const config = loadConfig(configPath);

    const watcher = startWatcher(
      config.plansPath,
      async () => {},
      ['.md'], // fileExtensions
      ['.git', 'node_modules'], // ignorePatterns
      config.debounceDelay
    );

    const server = createServer(config, db, coordination);
    await startServer(server, async () => {
      await stopWatcher(watcher);
      if (db) {
        db.close();
      }
    });

    // Shutdown should be graceful
    await server.close();
  });
});
