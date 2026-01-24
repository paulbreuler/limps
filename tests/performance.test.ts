import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema, indexAllDocuments } from '../src/indexer.js';
import { readCoordination } from '../src/coordination.js';
import { loadConfig } from '../src/config.js';
import { handleSearchDocs } from '../src/tools/search-docs.js';
import { writeCoordination } from '../src/coordination.js';
import type { ToolContext } from '../src/types.js';

describe('performance-indexing', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should index 1000 documents in less than 5 seconds', async () => {
    // Create 1000 test documents
    for (let i = 1; i <= 1000; i++) {
      const docPath = join(testDir, `doc-${i}.md`);
      writeFileSync(docPath, `# Document ${i}\n\nContent for document ${i}.`, 'utf-8');
    }

    const startTime = Date.now();
    const result = await indexAllDocuments(db!, testDir);
    const duration = Date.now() - startTime;

    expect(result.indexed).toBe(1000);
    expect(duration).toBeLessThan(5000); // < 5 seconds
  }, 10000); // 10 second timeout
});

describe('performance-search', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansDir: string;
  let coordinationPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    coordinationPath = join(testDir, 'coordination.json');

    mkdirSync(plansDir, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    // Index multiple documents
    for (let i = 1; i <= 100; i++) {
      const docPath = join(plansDir, `doc-${i}.md`);
      writeFileSync(
        docPath,
        `# Document ${i}\n\nThis document contains search term and other content.`,
        'utf-8'
      );
    }

    // Index all documents
    await indexAllDocuments(db!, plansDir);

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = plansDir;

    const coordination = await readCoordination(coordinationPath);

    context = {
      db,
      coordination,
      config,
    };
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should respond to search query in less than 100ms', async () => {
    const startTime = Date.now();
    const result = await handleSearchDocs({ query: 'search term' }, context);
    const duration = Date.now() - startTime;

    expect(result.content).toBeDefined();
    expect(result.isError).toBeFalsy();
    expect(duration).toBeLessThan(100); // < 100ms
  });
});

describe('performance-coordination', () => {
  let testDir: string;
  let coordinationPath: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    coordinationPath = join(testDir, 'coordination.json');
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should read coordination.json in less than 10ms', async () => {
    // Create initial coordination state by reading (which creates it)
    await readCoordination(coordinationPath);

    const startTime = Date.now();
    await readCoordination(coordinationPath);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(10); // < 10ms
  });

  it('should write coordination.json in less than 10ms', async () => {
    // Read current state first to get version
    const currentState = await readCoordination(coordinationPath);

    const state = {
      version: currentState.version,
      agents: {
        'agent-1': {
          id: 'agent-1',
          status: 'active',
          lastHeartbeat: Date.now(),
          currentTask: 'task-1',
        },
      },
      tasks: {
        'task-1': {
          status: 'WIP',
          claimedBy: 'agent-1',
          dependencies: [],
        },
      },
      fileLocks: {},
    };

    const startTime = Date.now();
    await writeCoordination(coordinationPath, state, currentState.version);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(10); // < 10ms
  });
});
