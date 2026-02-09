import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import { loadConfig, getHttpServerConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import {
  getPidFilePath,
  getRunningDaemon,
  discoverRunningDaemons,
  type PidFileContents,
} from '../pidfile.js';
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

const HTTP_OPTIONS: HttpClientOptions = {
  timeout: 3000,
  retries: 1,
  retryDelay: 500,
  logger: process.env.DEBUG ? (msg): void => console.error(`[limps:http] ${msg}`) : undefined,
};

/**
 * Check health for a single daemon and build a StatusResult.
 */
async function getDaemonStatus(daemon: PidFileContents): Promise<StatusResult> {
  const result = await checkDaemonHealth(daemon.host, daemon.port, HTTP_OPTIONS);
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
  }
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

/**
 * Resolve config and gather daemon + health status for a specific project.
 */
function getServerStatus(opts: z.infer<typeof options>): Promise<StatusResult> {
  const configPath = resolveConfigPath(opts.config);
  const config = loadConfig(configPath);
  const httpConfig = getHttpServerConfig(config);
  const pidFilePath = getPidFilePath(httpConfig.port);
  const daemon = getRunningDaemon(pidFilePath);

  if (!daemon) {
    return Promise.resolve({ running: false });
  }

  return getDaemonStatus(daemon);
}

/**
 * Discover all running daemons system-wide and gather their status.
 */
async function getAllServerStatuses(): Promise<StatusResult[]> {
  const daemons = discoverRunningDaemons();
  if (daemons.length === 0) {
    return [];
  }
  return Promise.all(daemons.map(getDaemonStatus));
}

/**
 * Check if a config is resolvable without throwing.
 */
function hasConfig(configOpt?: string): boolean {
  try {
    resolveConfigPath(configOpt);
    return true;
  } catch {
    return false;
  }
}

export default function StatusServerCommand({ options: opts }: Props): React.ReactNode {
  const jsonMode = isJsonMode(opts);
  const configAvailable = opts.config !== undefined || hasConfig();

  useEffect((): (() => void) | undefined => {
    if (jsonMode) {
      const timer = setTimeout(() => {
        if (configAvailable) {
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
        } else {
          getAllServerStatuses()
            .then((results) => {
              handleJsonOutput(() => ({ daemons: results }), 'STATUS_SERVER_ERROR');
            })
            .catch((err) => {
              outputJson(
                wrapError(err instanceof Error ? err.message : String(err), {
                  code: 'STATUS_SERVER_ERROR',
                }),
                1
              );
            });
        }
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [jsonMode, opts.config, configAvailable]);

  if (jsonMode) {
    return null;
  }

  if (configAvailable) {
    return <StatusDisplay opts={opts} />;
  }

  return <AllDaemonsDisplay />;
}

function AllDaemonsDisplay(): React.ReactNode {
  const [results, setResults] = useState<StatusResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAllServerStatuses()
      .then(setResults)
      .catch((err) => setError((err as Error).message));
  }, []);

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (!results) {
    return <Text>Scanning for running daemons...</Text>;
  }

  if (results.length === 0) {
    return <Text color="yellow">No limps daemons running.</Text>;
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text>
        Found {results.length} running daemon{results.length > 1 ? 's' : ''}:
      </Text>
      {results.map((result) => (
        <DaemonRow key={result.port} result={result} />
      ))}
    </Box>
  );
}

function DaemonRow({ result }: { result: StatusResult }): React.ReactNode {
  const uptimeStr = result.uptime !== undefined ? formatUptime(result.uptime) : 'unknown';
  const healthColor = result.healthy === false ? 'red' : 'green';

  return (
    <Box flexDirection="column">
      <Text color={healthColor}>
        {result.host}:{result.port} (PID {result.pid})
      </Text>
      <Text>
        {'  '}Uptime: {uptimeStr} | Sessions: {result.sessions ?? 'unknown'}
      </Text>
      {result.healthy === false && (
        <Text color="red">
          {'  '}Health check failed{result.healthError ? `: ${result.healthError}` : ''}
        </Text>
      )}
    </Box>
  );
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
