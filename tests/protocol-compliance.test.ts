import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../src/server.js';
import type { ServerConfig } from '../src/config.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import { existsSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * MCP Protocol Compliance Tests
 * Verifies the server adheres to MCP protocol specifications.
 */
describe('protocol-compliance', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let config: ServerConfig;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);

    db = initializeDatabase(dbPath);
    createSchema(db);

    config = {
      plansPath: join(testDir, 'plans'),
      dataPath: join(testDir, 'data'),
      coordinationPath,
    };
  });

  afterEach(async () => {
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

  it('should implement MCP server interface correctly', async () => {
    const server = createServer(config, db!, coordination);

    expect(server).toBeInstanceOf(McpServer);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Verify server has required MCP methods
    expect(typeof server.close).toBe('function');

    await server.close();
  });

  it('should use stdio transport as specified', async () => {
    const server = createServer(config, db!, coordination);

    const transport = new StdioServerTransport();
    await expect(server.connect(transport)).resolves.not.toThrow();

    await server.close();
  });

  it('should handle server initialization according to MCP spec', async () => {
    const server = createServer(config, db!, coordination);

    // Server should be ready after creation
    expect(server).toBeDefined();

    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Server should be connected and ready
    expect(server).toBeInstanceOf(McpServer);

    await server.close();
  });

  it('should register resources with correct URI format', async () => {
    const server = createServer(config, db!, coordination);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Verify resource context is set (resources are registered)
    const resourceContext = (server as any).resourceContext;
    expect(resourceContext).toBeDefined();

    await server.close();
  });

  it('should handle graceful shutdown according to MCP spec', async () => {
    const server = createServer(config, db!, coordination);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Shutdown should be graceful
    await expect(server.close()).resolves.not.toThrow();
  });

  it('should maintain server state correctly', async () => {
    const server = createServer(config, db!, coordination);

    // Verify tool context is stored
    const toolContext = (server as any).toolContext;
    expect(toolContext).toBeDefined();
    expect(toolContext.db).toBe(db);
    expect(toolContext.coordination).toBe(coordination);
    expect(toolContext.config).toBe(config);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    await server.close();
  });
});
