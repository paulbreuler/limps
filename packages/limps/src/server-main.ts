/**
 * MCP Server startup logic for stdio transport.
 * Uses shared initialization from server-shared.ts.
 */

import { createServer, startServer } from './server.js';
import {
  initServerResources,
  shutdownServerResources,
  type ServerResources,
} from './server-shared.js';

// Global reference for graceful shutdown
let resources: ServerResources | null = null;

/**
 * Start the MCP Planning Server on stdio transport.
 *
 * @param configPathArg - Optional config path from CLI argument
 */
export async function startMcpServer(configPathArg?: string): Promise<void> {
  // Close any previously opened resources to prevent FD leaks if called twice
  if (resources) {
    try {
      await shutdownServerResources(resources);
    } catch (error) {
      console.error('Failed to shut down previous resources during cleanup:', error);
    }
    resources = null;
  }

  // Initialize shared resources (config, database, file watcher)
  resources = await initServerResources(configPathArg);

  // Create and start server on stdio
  const server = await createServer(resources.config, resources.db);
  await startServer(server, async () => {
    // Graceful shutdown callback
    if (resources) {
      await shutdownServerResources(resources);
      resources = null;
    }
  });
}
