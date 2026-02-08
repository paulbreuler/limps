import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, getHttpServerConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { getPidFilePath, getRunningDaemon } from '../pidfile.js';
import { startHttpServer, stopHttpServer } from '../server-http.js';
import {
  checkDaemonHealth,
  isDaemonHealthy,
  type HttpClientOptions,
} from '../utils/http-client.js';

export const description = 'Start the limps HTTP server';

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  foreground: z.boolean().optional().describe('Run in foreground (do not daemonize)'),
  port: z.number().optional().describe('Override port number'),
  host: z.string().optional().describe('Override host address'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function StartCommand({ options: opts }: Props): React.ReactNode {
  const [status, setStatus] = useState<string>('Starting...');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const run = async (): Promise<void> => {
      try {
        const configPath = resolveConfigPath(opts.config);
        const config = loadConfig(configPath);
        const httpConfig = getHttpServerConfig(config);
        const port = opts.port ?? httpConfig.port;
        const host = opts.host ?? httpConfig.host;

        // Check if already running
        const pidFilePath = getPidFilePath(config.dataPath);
        const existing = getRunningDaemon(pidFilePath);
        if (existing) {
          setError(
            `limps daemon already running (PID ${existing.pid} on ${existing.host}:${existing.port}). Run 'limps stop' first.`
          );
          return;
        }

        if (opts.foreground) {
          // Run in foreground — blocks until stopped
          setStatus(`limps HTTP server starting on http://${host}:${port}/mcp`);
          await startHttpServer(configPath);
          setStatus(`limps HTTP server running on http://${host}:${port}/mcp (PID ${process.pid})`);

          // Keep process alive — stopHttpServer will be called by signal handlers
          // registered in the server-http module
          await new Promise<void>((resolve) => {
            const shutdown = (): void => {
              stopHttpServer()
                .then(() => resolve())
                .catch(() => resolve());
            };
            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);
          });
        } else {
          // Daemon mode — spawn detached child
          const __filename = fileURLToPath(import.meta.url);
          const __dirname = dirname(__filename);
          const entryPath = resolve(__dirname, '../server-http-entry.js');

          const child = spawn(process.execPath, [entryPath, configPath], {
            detached: true,
            stdio: 'ignore',
          });
          child.unref();

          // HTTP options for health checks
          const httpOptions: HttpClientOptions = {
            timeout: 500,
            retries: 0,
            logger: process.env.DEBUG
              ? (msg): void => console.error(`[limps:http] ${msg}`)
              : undefined,
          };

          // Poll for daemon startup with timeout (max 5s)
          const startTime = Date.now();
          const timeout = 5000;
          const pollInterval = 200;
          let daemon = null;

          while (Date.now() - startTime < timeout) {
            daemon = getRunningDaemon(pidFilePath);
            if (daemon) {
              // Verify the daemon is actually responding to requests
              const isHealthy = await isDaemonHealthy(daemon.host, daemon.port, httpOptions);
              if (isHealthy) break;
            }
            await new Promise<void>((resolve) => setTimeout(resolve, pollInterval));
          }

          if (daemon) {
            // Final verification with detailed error handling
            const healthResult = await checkDaemonHealth(daemon.host, daemon.port, {
              ...httpOptions,
              timeout: 1000,
            });

            if (healthResult.ok && healthResult.data.status === 'ok') {
              setStatus(
                `limps daemon started (PID ${daemon.pid}) on http://${daemon.host}:${daemon.port}/mcp`
              );
            } else {
              const errorMsg = healthResult.ok
                ? `Health check returned status: ${healthResult.data.status}`
                : `${healthResult.error.message} (${healthResult.error.code})`;

              const suggestion =
                !healthResult.ok && healthResult.error.code === 'TIMEOUT'
                  ? 'Daemon may be slow to start. Try increasing timeout or check system resources.'
                  : !healthResult.ok && healthResult.error.code === 'NETWORK_ERROR'
                    ? 'Cannot connect to daemon. Check if port is blocked or already in use.'
                    : 'Try running: limps start --foreground';

              setError(`${errorMsg}\n${suggestion}\n\nRun with DEBUG=1 for more details.`);
            }
          } else {
            setError(
              'Daemon may have failed to start. Check logs or try: limps start --foreground'
            );
          }
          setDone(true);
        }
      } catch (err) {
        setError((err as Error).message);
        setDone(true);
      }
    };

    void run();
  }, [opts.config, opts.foreground, opts.port, opts.host]);

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (done || opts.foreground) {
    return <Text color="green">{status}</Text>;
  }

  return <Text>{status}</Text>;
}
