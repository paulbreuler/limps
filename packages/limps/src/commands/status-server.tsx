import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { getPidFilePath, getRunningDaemon } from '../pidfile.js';
import { handleJsonOutput, isJsonMode, outputJson, wrapError } from '../cli/json-output.js';
import { checkDaemonHealth, type HttpClientOptions } from '../utils/http-client.js';

export const description = 'Show limps HTTP server status';

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  options: z.infer<typeof options>;
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
  healthError?: string;
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

  const httpOptions: HttpClientOptions = {
    timeout: 3000,
    retries: 1,
    retryDelay: 500,
    logger: process.env.DEBUG ? (msg): void => console.error(`[limps:http] ${msg}`) : undefined,
  };

  return checkDaemonHealth(daemon.host, daemon.port, httpOptions).then((result) => {
    if (result.ok) {
      return {
        running: true,
        pid: daemon.pid,
        host: daemon.host,
        port: daemon.port,
        startedAt: daemon.startedAt,
        uptime: result.data.uptime,
        sessions: result.data.sessions,
        sessionTimeoutMs: result.data.sessionTimeoutMs,
        healthy: result.data.status === 'ok',
      };
    } else {
      return {
        running: true,
        pid: daemon.pid,
        host: daemon.host,
        port: daemon.port,
        startedAt: daemon.startedAt,
        healthy: false,
        healthError: `${result.error.message} (${result.error.code})`,
      };
    }
  });
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
      {result.healthy === false && (
        <Text color="red">
          Health check failed{result.healthError ? `: ${result.healthError}` : ''}
        </Text>
      )}
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
