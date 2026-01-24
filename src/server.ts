import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ServerConfig } from './config.js';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { CoordinationState } from './coordination.js';
import type { ToolContext, ResourceContext } from './types.js';
import { registerResources } from './resources/index.js';
import { registerTools } from './tools/index.js';

/**
 * Create an MCP server instance with the given configuration.
 *
 * @param config - Server configuration
 * @param db - Database instance for tools and resources
 * @param coordination - Coordination state for multi-agent orchestration
 * @returns MCP server instance
 */
export function createServer(
  config: ServerConfig,
  db: DatabaseType,
  coordination: CoordinationState
): McpServer {
  const server = new McpServer({
    name: 'mcp-planning-server',
    version: '0.2.0',
  });

  // Tool context for handlers
  const toolContext: ToolContext = {
    db,
    coordination,
    config,
  };

  // Store on server instance for tool handlers to access
  (server as McpServer & { toolContext: ToolContext }).toolContext = toolContext;

  // Resource context for handlers
  const resourceContext: ResourceContext = {
    db,
    coordination,
    config,
  };

  // Register resources
  registerResources(server, resourceContext);

  // Register tools
  registerTools(server, toolContext);

  return server;
}

/**
 * Start the MCP server with stdio transport and handle graceful shutdown.
 *
 * @param server - MCP server instance to start
 * @param onShutdown - Optional callback to run during graceful shutdown (e.g., stop watcher, close db)
 */
export async function startServer(
  server: McpServer,
  onShutdown?: () => Promise<void>
): Promise<void> {
  const transport = new StdioServerTransport();

  // Set up signal handlers for graceful shutdown
  // Only register exit handlers if not in test environment
  const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

  const shutdown = async (signal: string): Promise<void> => {
    console.error(`Received ${signal}, shutting down gracefully...`);
    try {
      // Run custom shutdown callback first (stop watcher, close db)
      if (onShutdown) {
        await onShutdown();
      }
      await server.close();
      if (!isTestEnvironment) {
        process.exit(0);
      }
    } catch (error) {
      console.error(`Error during shutdown:`, error);
      if (!isTestEnvironment) {
        process.exit(1);
      } else {
        throw error;
      }
    }
  };

  if (!isTestEnvironment) {
    process.on('SIGINT', () => {
      shutdown('SIGINT').catch((error) => {
        console.error('Error in SIGINT handler:', error);
        process.exit(1);
      });
    });

    process.on('SIGTERM', () => {
      shutdown('SIGTERM').catch((error) => {
        console.error('Error in SIGTERM handler:', error);
        process.exit(1);
      });
    });

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      shutdown('uncaughtException').catch(() => {
        process.exit(1);
      });
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection').catch(() => {
        process.exit(1);
      });
    });
  }

  try {
    await server.connect(transport);
    console.error('MCP Planning Server running on stdio');
  } catch (error) {
    console.error('Failed to start server:', error);
    throw error;
  }
}
