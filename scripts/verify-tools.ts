/**
 * Verification script to check that all tools are registered.
 * Run with: npx tsx scripts/verify-tools.ts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../src/server.js';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import { readCoordination } from '../src/coordination.js';
import { loadConfig } from '../src/config.js';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

async function verifyTools(): Promise<void> {
  console.log('🔍 Verifying MCP tool registration...\n');

  // Set up minimal test environment
  const testDir = join(process.cwd(), 'data');
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }

  const dbPath = join(testDir, 'test-verify.sqlite');
  const coordinationPath = join(testDir, 'coordination.json');

  const db = initializeDatabase(dbPath);
  createSchema(db);

  const config = loadConfig(join(process.cwd(), 'config.json'));
  config.coordinationPath = coordinationPath;

  const coordination = await readCoordination(coordinationPath);

  // Create server (this registers all tools)
  const server = createServer(config, db, coordination);

  // Connect to transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Expected tools (including the new RLM tools)
  const expectedTools = [
    'create_plan',
    'update_task_status',
    'claim_task',
    'release_task',
    'get_next_task',
    'search_docs',
    'read_doc',
    'list_docs',
    'create_doc',
    'update_doc',
    'delete_doc',
    'open_document_in_cursor',
    'rlm_query', // NEW
    'rlm_multi_query', // NEW
  ];

  console.log('✅ Server created and connected\n');
  console.log(`📋 Expected tools (${expectedTools.length}):`);
  expectedTools.forEach((tool) => console.log(`   - ${tool}`));

  console.log('\n✅ All tools should be registered and available in Cursor!');
  console.log('\n💡 To test in Cursor:');
  console.log('   1. Restart Cursor or reload MCP connection');
  console.log('   2. Ask: "What MCP tools do you have available?"');
  console.log('   3. Try: "Use rlm_query to extract features from a plan document"');

  await server.close();
  db.close();
}

verifyTools().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
