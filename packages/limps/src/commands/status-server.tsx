import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import { request as httpRequest } from 'http';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { getPidFilePath, getRunningDaemon } from '../pidfile.js';
import { handleJsonOutput, isJsonMode, outputJson, wrapError } from '../cli/json-output.js';

export const description = 'Show limps HTTP server status';

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  options: z.infer<typeof options>;
}

interface HealthResponse {
  status: string;
  sessions: number;
  uptime: number;
  pid: number;
  sessionTimeoutMs?: number;
}

interface StatusResult {
  running: boolean;
  pid?: number;
  host?: string;
  port?: number;
  startedAt?: string;
  uptime?: number;
  sessions?: number;
  sessionTimeoutMs?: number;
  healthy?: boolean;
}

/**
 * Fetch health info from the daemon's /health endpoint.
 */
function fetchHealth(host: string, port: number): Promise<HealthResponse | null> {
  return new Promise((resolve) => {
    const req = httpRequest(
      { hostname: host, port, method: 'GET', path: '/health', timeout: 3000 },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body) as HealthResponse);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

/**
 * Resolve config and gather daemon + health status.
 */
function getServerStatus(opts: z.infer<typeof options>): Promise<StatusResult> {
  const configPath = resolveConfigPath(opts.config);
  const config = loadConfig(configPath);
  const pidFilePath = getPidFilePath(config.dataPath);
  const daemon = getRunningDaemon(pidFilePath);

  if (!daemon) {
    return Promise.resolve({ running: false });
  }

  return fetchHealth(daemon.host, daemon.port).then((health) => ({
    running: true,
    pid: daemon.pid,
    host: daemon.host,
    port: daemon.port,
    startedAt: daemon.startedAt,
    uptime: health?.uptime,
    sessions: health?.sessions,
    sessionTimeoutMs: health?.sessionTimeoutMs,
    healthy: health?.status === 'ok',
  }));
}

export default function StatusServerCommand({ options: opts }: Props): React.ReactNode {
  const jsonMode = isJsonMode(opts);

  useEffect((): (() => void) | undefined => {
    if (jsonMode) {
      const timer = setTimeout(() => {
        getServerStatus(opts)
          .then((result) => {
            handleJsonOutput(() => result, 'STATUS_SERVER_ERROR');
          })
          .catch((err) => {
            outputJson(
              wrapError(err instanceof Error ? err.message : String(err), {
                code: 'STATUS_SERVER_ERROR',
              }),
              1
            );
          });
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [jsonMode, opts.config]);

  if (jsonMode) {
    return null;
  }

  return <StatusDisplay opts={opts} />;
}

function StatusDisplay({ opts }: { opts: z.infer<typeof options> }): React.ReactNode {
  const [result, setResult] = useState<StatusResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getServerStatus(opts)
      .then(setResult)
      .catch((err) => setError((err as Error).message));
  }, [opts.config]);

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (!result) {
    return <Text>Checking server status...</Text>;
  }

  if (!result.running) {
    return <Text color="yellow">limps server is not running.</Text>;
  }

  const uptimeStr = result.uptime !== undefined ? formatUptime(result.uptime) : 'unknown';

  return (
    <Box flexDirection="column">
      <Text color="green">limps server is running</Text>
      <Text>
        PID: {result.pid} | {result.host}:{result.port}
      </Text>
      <Text>Uptime: {uptimeStr}</Text>
      <Text>Sessions: {result.sessions ?? 'unknown'}</Text>
      {result.healthy === false && <Text color="red">Health check failed</Text>}
    </Box>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
