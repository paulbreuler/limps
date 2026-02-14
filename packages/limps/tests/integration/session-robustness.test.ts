import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../src/server.js';
import type { ServerConfig } from '../../src/config.js';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema } from '../../src/indexer.js';
import { existsSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { handlePing } from '../../src/tools/ping.js';
import type { ToolContext } from '../../src/types.js';

/**
 * Integration tests for session robustness features:
 * - ping tool
 * - session info resource (registered in server-http per-session)
 * - session renew endpoint (HTTP-level, tested structurally)
 */
describe('session-robustness', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let config: ServerConfig;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-session-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-session-dir-${Date.now()}`);

    db = initializeDatabase(dbPath);
    createSchema(db);

    config = {
      plansPath: './plans',
      dataPath: testDir,
      scoring: {
        weights: { dependency: 40, priority: 30, workload: 30 },
        biases: {},
      },
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

  describe('ping tool', () => {
    it('should return pong and a valid ISO timestamp', async () => {
      const context: ToolContext = { db: db!, config };
      const result = await handlePing({}, context);

      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe('text');

      const parsed = JSON.parse(result.content[0]!.text) as {
        pong: boolean;
        timestamp: string;
      };
      expect(parsed.pong).toBe(true);
      expect(parsed.timestamp).toBeDefined();

      // Validate ISO timestamp format
      const ts = new Date(parsed.timestamp);
      expect(ts.getTime()).not.toBeNaN();
    });

    it('should return a timestamp close to current time', async () => {
      const before = Date.now();
      const context: ToolContext = { db: db!, config };
      const result = await handlePing({}, context);
      const after = Date.now();

      const parsed = JSON.parse(result.content[0]!.text) as {
        pong: boolean;
        timestamp: string;
      };
      const ts = new Date(parsed.timestamp).getTime();

      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('should not set isError', async () => {
      const context: ToolContext = { db: db!, config };
      const result = await handlePing({}, context);
      expect(result.isError).toBeUndefined();
    });
  });

  describe('server creation with session support', () => {
    it('should create a server with tool and resource contexts', async () => {
      const server = await createServer(config, db!);

      const toolContext = (server as any).toolContext;
      expect(toolContext).toBeDefined();
      expect(toolContext.db).toBe(db);
      expect(toolContext.config).toBe(config);

      const resourceContext = (server as any).resourceContext;
      expect(resourceContext).toBeDefined();
      expect(resourceContext.db).toBe(db);
    });
  });
});
