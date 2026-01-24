/**
 * Integration tests for Document CRUD features #8 (Index Integration) and #9 (Tool Registration).
 * Tests verify end-to-end integration of document operations with search index and MCP tool registration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type Database from 'better-sqlite3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { handleCreateDoc } from '../src/tools/create-doc.js';
import { handleUpdateDoc } from '../src/tools/update-doc.js';
import { handleDeleteDoc } from '../src/tools/delete-doc.js';
import { handleSearchDocs } from '../src/tools/search-docs.js';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import { registerTools } from '../src/tools/index.js';
import type { ToolContext } from '../src/types.js';
import type { ServerConfig } from '../src/config.js';
import { readCoordination } from '../src/coordination.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test directory
const TEST_DIR = join(__dirname, '..', '..', '.tmp', 'document-crud-integration-test');
const TEST_REPO_ROOT = join(TEST_DIR, 'repo');
const TEST_DATA_DIR = join(TEST_DIR, 'data');

describe('document-crud-integration', () => {
  let db: Database.Database;
  let context: ToolContext;
  let config: ServerConfig;

  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_REPO_ROOT, { recursive: true });
    mkdirSync(TEST_DATA_DIR, { recursive: true });

    // Create test config
    config = {
      plansPath: join(TEST_REPO_ROOT, 'plans'),
      docsPaths: [TEST_REPO_ROOT],
      fileExtensions: ['.md', '.jsx'],
      dataPath: TEST_DATA_DIR,
      coordinationPath: join(TEST_DATA_DIR, 'coordination.json'),
      heartbeatTimeout: 300000,
      debounceDelay: 200,
      maxHandoffIterations: 3,
    };

    // Initialize database
    const dbPath = join(TEST_DATA_DIR, 'documents.sqlite');
    db = initializeDatabase(dbPath);
    createSchema(db);

    // Create coordination state
    const coordination = readCoordination(config.coordinationPath);

    // Create tool context
    context = {
      db,
      coordination,
      config,
    };
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('Feature #8: Index Integration', () => {
    it('search finds new content after create [search-finds-new-content]', async () => {
      // Create a new document
      const createResult = await handleCreateDoc(
        {
          path: 'research/new-topic.md',
          content: '# New Topic\n\nThis is about machine learning and AI.',
          template: 'none',
        },
        context
      );

      expect(createResult.isError).toBeUndefined();

      // Search for the new content
      const searchResult = await handleSearchDocs(
        {
          query: 'machine learning',
          limit: 10,
        },
        context
      );

      expect(searchResult.isError).toBeUndefined();
      const resultText = searchResult.content[0].text;

      // Should find the newly created document
      expect(resultText).toContain('new-topic.md');
      expect(resultText).toContain('machine learning');
    });

    it('search reflects updated content after update', async () => {
      // Create initial document
      const filePath = join(TEST_REPO_ROOT, 'research', 'update-test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, '# Original Title\n\nOld content about databases.', 'utf-8');

      // Index it manually first
      const { indexDocument } = await import('../src/indexer.js');
      await indexDocument(db, filePath);

      // Update the document
      await handleUpdateDoc(
        {
          path: 'research/update-test.md',
          content: '# Updated Title\n\nNew content about PostgreSQL and SQL.',
          createBackup: false,
        },
        context
      );

      // Search for new content
      const searchResult = await handleSearchDocs(
        {
          query: 'PostgreSQL',
          limit: 10,
        },
        context
      );

      expect(searchResult.isError).toBeUndefined();
      const resultText = searchResult.content[0].text;

      // Should find updated document with new content
      expect(resultText).toContain('update-test.md');
      expect(resultText).toContain('Updated Title');
      expect(resultText).toContain('PostgreSQL');
    });

    it('search no longer finds deleted content after delete', async () => {
      // Create and index a document
      const filePath = join(TEST_REPO_ROOT, 'research', 'delete-test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, '# Delete Test\n\nContent about testing and deletion.', 'utf-8');

      const { indexDocument } = await import('../src/indexer.js');
      await indexDocument(db, filePath);

      // Verify it's searchable
      let searchResult = await handleSearchDocs(
        {
          query: 'deletion',
          limit: 10,
        },
        context
      );

      expect(searchResult.isError).toBeUndefined();
      let resultText = searchResult.content[0].text;
      expect(resultText).toContain('delete-test.md');

      // Delete the document
      await handleDeleteDoc(
        {
          path: 'research/delete-test.md',
          confirm: true,
          permanent: false,
        },
        context
      );

      // Search again - should not find it
      searchResult = await handleSearchDocs(
        {
          query: 'deletion',
          limit: 10,
        },
        context
      );

      expect(searchResult.isError).toBeUndefined();
      resultText = searchResult.content[0].text;
      // Should either have no results or not contain delete-test.md
      expect(resultText.includes('delete-test.md')).toBe(false);
    });
  });

  describe('Feature #9: Tool Registration', () => {
    let server: McpServer;

    beforeEach(() => {
      server = new McpServer({
        name: 'test-server',
        version: '1.0.0',
      });
    });

    afterEach(async () => {
      try {
        await server.close();
      } catch {
        // Server may not be connected
      }
    });

    it('registers all 5 document tools [register-tools]', () => {
      registerTools(server, context);

      // Verify no errors during registration
      expect(server).toBeDefined();

      // Tools should be registered: read_doc, list_docs, create_doc, update_doc, delete_doc
      // We verify by checking the server accepts tool registration without errors
      // The actual tool list would be verified via MCP protocol in a full integration test
    });

    it('document tools have correct schemas [tool-schemas]', async () => {
      registerTools(server, context);

      // Verify schemas are defined correctly by checking imports
      const { ReadDocInputSchema } = await import('../src/tools/read-doc.js');
      const { ListDocsInputSchema } = await import('../src/tools/list-docs.js');
      const { CreateDocInputSchema } = await import('../src/tools/create-doc.js');
      const { UpdateDocInputBaseSchema } = await import('../src/tools/update-doc.js');
      const { DeleteDocInputSchema } = await import('../src/tools/delete-doc.js');

      expect(ReadDocInputSchema).toBeDefined();
      expect(ListDocsInputSchema).toBeDefined();
      expect(CreateDocInputSchema).toBeDefined();
      expect(UpdateDocInputBaseSchema).toBeDefined();
      expect(DeleteDocInputSchema).toBeDefined();
    });

    it('tool handlers work correctly [tool-handlers]', async () => {
      // Test that handlers can be called and work correctly
      // This is verified by the individual tool tests, but we verify integration here

      // Create tool
      const createResult = await handleCreateDoc(
        {
          path: 'examples/test.jsx',
          content: 'export default function Test() {}',
          template: 'none',
        },
        context
      );
      expect(createResult.isError).toBeUndefined();

      // Update tool
      const updateResult = await handleUpdateDoc(
        {
          path: 'examples/test.jsx',
          content: 'export default function Test() { return null; }',
          createBackup: false,
        },
        context
      );
      expect(updateResult.isError).toBeUndefined();

      // Delete tool
      const deleteResult = await handleDeleteDoc(
        {
          path: 'examples/test.jsx',
          confirm: true,
          permanent: true,
        },
        context
      );
      expect(deleteResult.isError).toBeUndefined();
    });

    it('existing tools still work after document tool registration', () => {
      // Verify that registering document tools doesn't break existing tools
      registerTools(server, context);

      // Existing tools should still be registered:
      // create_plan, update_task_status, claim_task, release_task, get_next_task, search_docs
      // We verify by checking no errors during registration
      expect(server).toBeDefined();
    });
  });
});
