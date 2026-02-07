import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ServerConfig } from './config.js';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { ToolContext, ResourceContext } from './types.js';
import { CORE_RESOURCE_NAMES, CORE_RESOURCE_URIS, registerResources } from './resources/index.js';
import { CORE_TOOL_NAMES, registerTools } from './tools/index.js';
import {
  loadExtensions,
  getExtensionTools,
  getExtensionResources,
  shutdownExtensions,
  type LoadedExtension,
} from './extensions/loader.js';

/**
 * Create an MCP server instance with the given configuration.
 * Loads and registers extensions if configured.
 *
 * @param config - Server configuration
 * @param db - Database instance for tools and resources
 * @returns MCP server instance with loaded extensions stored on it
 */
export async function createServer(
  config: ServerConfig,
  db: DatabaseType
): Promise<McpServer & { loadedExtensions?: LoadedExtension[] }> {
  const coreToolNames = new Set<string>(CORE_TOOL_NAMES);
  const coreResourceUris = new Set<string>(CORE_RESOURCE_URIS);
  const coreResourceNames = new Set<string>(CORE_RESOURCE_NAMES);

  const server = new McpServer({
    name: 'limps',
    version: '0.2.0',
  });

  // Tool context for handlers
  const toolContext: ToolContext = {
    db,
    config,
  };

  // Store on server instance for tool handlers to access
  (server as McpServer & { toolContext: ToolContext }).toolContext = toolContext;

  // Resource context for handlers
  const resourceContext: ResourceContext = {
    db,
    config,
  };

  // Register core resources
  registerResources(server, resourceContext);

  // Register core tools
  registerTools(server, toolContext);

  // Load and register extensions
  const loadedExtensions = await loadExtensions(config);
  if (loadedExtensions.length > 0) {
    // Store extensions on server for shutdown
    (server as McpServer & { loadedExtensions: LoadedExtension[] }).loadedExtensions =
      loadedExtensions;

    // Register extension tools
    const extensionTools = getExtensionTools(loadedExtensions);
    for (const tool of extensionTools) {
      if (coreToolNames.has(tool.name)) {
        console.error(
          `Tool name collision: ${tool.name} is a core tool. Extension tool will be skipped.`
        );
        continue;
      }
      server.tool(tool.name, tool.description, tool.inputSchema.shape, tool.handler);
    }

    // Register extension resources
    const extensionResources = getExtensionResources(loadedExtensions);
    for (const resource of extensionResources) {
      if (coreResourceUris.has(resource.uri) || coreResourceNames.has(resource.name)) {
        console.error(
          `Resource collision: ${resource.uri} (${resource.name}) matches a core resource. Extension resource will be skipped.`
        );
        continue;
      }
      server.resource(resource.name, resource.uri, resource.handler);
    }
  }

  return server as McpServer & { loadedExtensions?: LoadedExtension[] };
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

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      console.error(`Received ${signal} during shutdown, ignoring.`);
      return;
    }
    shuttingDown = true;
    console.error(`Received ${signal}, shutting down gracefully...`);
    try {
      // Shutdown extensions first
      const serverWithExtensions = server as McpServer & {
        loadedExtensions?: LoadedExtension[];
      };
      if (serverWithExtensions.loadedExtensions) {
        await shutdownExtensions(serverWithExtensions.loadedExtensions);
      }

      // Run custom shutdown callback (stop watcher, close db)
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
