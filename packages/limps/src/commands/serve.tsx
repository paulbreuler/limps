/**
 * Serve command: stdio-to-HTTP bridge for Claude Desktop and Cursor.
 * Ensures the HTTP daemon is running and proxies stdio ↔ HTTP.
 */

import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createServer } from '../server.js';
import {
  initServerResources,
  shutdownServerResources,
  type ServerResources,
} from '../server-shared.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { ensureDaemonRunning } from '../utils/daemon-manager.js';
import { shutdownExtensions, type LoadedExtension } from '../extensions/loader.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const description = 'Start stdio-to-HTTP bridge for Claude Desktop/Cursor';

export const args = z.tuple([]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function Serve({ options: opts }: Props): React.ReactNode {
  const [status, setStatus] = useState<string>('Initializing...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let transport: StreamableHTTPClientTransport | null = null;
    let server: McpServer | null = null;
    let resources: ServerResources | null = null;
    let shuttingDown = false;

    const shutdown = async (signal: string): Promise<void> => {
      if (shuttingDown) {
        console.error(`[limps:serve] Received ${signal} during shutdown, ignoring.`);
        return;
      }
      shuttingDown = true;
      console.error(`[limps:serve] Received ${signal}, shutting down...`);

      try {
        // Shutdown extensions
        if (server) {
          const serverWithExtensions = server as McpServer & {
            loadedExtensions?: LoadedExtension[];
          };
          if (serverWithExtensions.loadedExtensions) {
            await shutdownExtensions(serverWithExtensions.loadedExtensions);
          }
        }

        // Close transport (closes HTTP session)
        if (transport?.close) {
          await transport.close();
        }

        // Clean up resources (DO NOT shut down the daemon itself!)
        // The daemon should keep running for other clients
        if (resources) {
          await shutdownServerResources(resources);
        }

        process.exit(0);
      } catch (err) {
        console.error('[limps:serve] Error during shutdown:', err);
        process.exit(1);
      }
    };

    const run = async (): Promise<void> => {
      try {
        const configPath = resolveConfigPath(opts.config);

        // Ensure daemon is running (starts if needed)
        setStatus('Checking daemon status...');
        const daemon = await ensureDaemonRunning(configPath);

        // Initialize resources for this bridge process
        // (Needed for extension loading and other shared state)
        setStatus('Initializing server resources...');
        resources = await initServerResources(configPath);

        // Create HTTP client transport to daemon
        setStatus(`Connecting to daemon at http://${daemon.host}:${daemon.port}/mcp...`);
        transport = new StreamableHTTPClientTransport(
          new URL(`http://${daemon.host}:${daemon.port}/mcp`)
        );

        // Create MCP server for this bridge
        server = await createServer(resources.config, resources.db);

        // Set up signal handlers
        process.on('SIGINT', () => {
          shutdown('SIGINT').catch((err) => {
            console.error('[limps:serve] Error in SIGINT handler:', err);
            process.exit(1);
          });
        });

        process.on('SIGTERM', () => {
          shutdown('SIGTERM').catch((err) => {
            console.error('[limps:serve] Error in SIGTERM handler:', err);
            process.exit(1);
          });
        });

        // Connect server to transport (bridges stdio ↔ HTTP)
        setStatus('Starting stdio-to-HTTP bridge...');
        await server.connect(transport);

        // Bridge is now active
        setStatus(`Bridge active. Connected to daemon on http://${daemon.host}:${daemon.port}/mcp`);
        console.error('[limps:serve] stdio-to-HTTP bridge running');

        // Keep process alive until shutdown signal
        // The MCP SDK handles all stdio ↔ HTTP bridging automatically
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        if (errorMessage.includes('ECONNREFUSED')) {
          setError(
            `Cannot connect to daemon. The daemon may have failed to start.\n` +
              `Try starting it manually: limps start --foreground`
          );
        } else if (errorMessage.includes('Failed to start daemon')) {
          setError(errorMessage + '\n\nTry: limps start --foreground');
        } else {
          setError(`Failed to start bridge: ${errorMessage}`);
        }
      }
    };

    void run();

    // Cleanup on unmount
    return (): void => {
      if (!shuttingDown) {
        shutdown('unmount').catch((err) => {
          console.error('[limps:serve] Error during unmount cleanup:', err);
        });
      }
    };
  }, [opts.config]);

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  return <Text color="green">{status}</Text>;
}
