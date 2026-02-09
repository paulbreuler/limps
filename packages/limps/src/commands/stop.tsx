import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { loadConfig, getHttpServerConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { getPidFilePath, getRunningDaemon, removePidFile } from '../pidfile.js';

export const description = 'Stop the limps HTTP server';

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function StopCommand({ options: opts }: Props): React.ReactNode {
  const [status, setStatus] = useState<string>('Stopping...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let checkInterval: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      const configPath = resolveConfigPath(opts.config);
      const config = loadConfig(configPath);
      const httpConfig = getHttpServerConfig(config);
      const pidFilePath = getPidFilePath(httpConfig.port);
      const daemon = getRunningDaemon(pidFilePath);

      if (!daemon) {
        setStatus('No running limps daemon found.');
        return;
      }

      // Send SIGTERM for graceful shutdown
      try {
        process.kill(daemon.pid, 'SIGTERM');
        setStatus(`Sent SIGTERM to limps daemon (PID ${daemon.pid}).`);
      } catch {
        // Process already gone
        removePidFile(pidFilePath);
        setStatus(`Daemon (PID ${daemon.pid}) already stopped. Cleaned up PID file.`);
        return;
      }

      // Wait for process to exit, then clean up
      checkInterval = setInterval(() => {
        try {
          process.kill(daemon.pid, 0);
          // Still running — keep waiting
        } catch {
          // Process has exited
          if (checkInterval) clearInterval(checkInterval);
          if (timeoutId) clearTimeout(timeoutId);
          removePidFile(pidFilePath);
          setStatus(`limps daemon stopped (PID ${daemon.pid}).`);
        }
      }, 200);

      // Timeout after 10 seconds
      timeoutId = setTimeout(() => {
        if (checkInterval) clearInterval(checkInterval);
        try {
          process.kill(daemon.pid, 0);
          // Still running — force kill
          process.kill(daemon.pid, 'SIGKILL');
          removePidFile(pidFilePath);
          setStatus(`Force-killed limps daemon (PID ${daemon.pid}).`);
        } catch {
          // Already gone
          removePidFile(pidFilePath);
          setStatus(`limps daemon stopped (PID ${daemon.pid}).`);
        }
      }, 10_000);
    } catch (err) {
      setError((err as Error).message);
    }

    return (): void => {
      if (checkInterval) clearInterval(checkInterval);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [opts.config]);

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  return <Text color="green">{status}</Text>;
}
