import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { get } from 'http';
import { loadConfig, getHttpServerConfig } from '../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../utils/config-resolver.js';
import { getPidFilePath, getRunningDaemon } from '../pidfile.js';
import { startHttpServer, stopHttpServer } from '../server-http.js';

/**
 * Check if the daemon is responding to health requests.
 */
async function checkDaemonHealth(host: string, port: number, timeoutMs: number = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const req = get(`http://${host}:${port}/health`, { timeout: timeoutMs }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.setTimeout(timeoutMs);
  });
}

export const description = 'Start the limps HTTP server';

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  project: z.string().optional().describe('Registered project name'),
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
        const configPath = opts.project
          ? resolveProjectConfigPath(opts.project)
          : resolveConfigPath(opts.config);
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

          // Poll for daemon startup with timeout (max 5s)
          const startTime = Date.now();
          const timeout = 5000;
          const pollInterval = 200;
          let daemon = null;

          while (Date.now() - startTime < timeout) {
            daemon = getRunningDaemon(pidFilePath);
            if (daemon) {
              // Verify the daemon is actually responding to requests
              const isHealthy = await checkDaemonHealth(daemon.host, daemon.port, 500);
              if (isHealthy) break;
            }
            await new Promise<void>((resolve) => setTimeout(resolve, pollInterval));
          }
          if (daemon) {
            // Final verification that the daemon is healthy
            const isHealthy = await checkDaemonHealth(daemon.host, daemon.port, 1000);
            if (isHealthy) {
              setStatus(
                `limps daemon started (PID ${daemon.pid}) on http://${daemon.host}:${daemon.port}/mcp`
              );
            } else {
              setError(
                'Daemon started but is not responding to health checks. Check logs or try: limps start --foreground'
              );
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
  }, [opts.config, opts.project, opts.foreground, opts.port, opts.host]);

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (done || opts.foreground) {
    return <Text color="green">{status}</Text>;
  }

  return <Text>{status}</Text>;
}
