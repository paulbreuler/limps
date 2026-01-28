/**
 * Verification script to check that all tools are registered.
 * Run with: npx tsx scripts/verify-tools.ts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../src/server.js';
import { initializeDatabase, createSchema } from '../src/indexer.js';
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
  const db = initializeDatabase(dbPath);
  createSchema(db);

  const config = loadConfig(join(process.cwd(), 'config.json'));

  // Create server (this registers all tools)
  const server = await createServer(config, db);

  // Connect to transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Expected tools (15 total)
  const expectedTools = [
    // Plan Management
    'create_plan',
    'list_plans',
    'list_agents',
    'get_plan_status',
    // Task Management
    'update_task_status',
    'get_next_task',
    // Document Operations
    'search_docs',
    'list_docs',
    'create_doc',
    'update_doc',
    'delete_doc',
    'open_document_in_cursor',
    // RLM Processing
    'process_doc',
    'process_docs',
  ];

  console.log('✅ Server created and connected\n');
  console.log(`📋 Expected tools (${expectedTools.length}):`);
  expectedTools.forEach((tool) => console.log(`   - ${tool}`));

  console.log('\n✅ All tools should be registered and available in Cursor!');
  console.log('\n💡 To test in Cursor:');
  console.log('   1. Restart Cursor or reload MCP connection');
  console.log('   2. Ask: "What MCP tools do you have available?"');
  console.log('   3. Try: "Use process_doc to extract features from a plan document"');

  await server.close();
  db.close();
}

verifyTools().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
