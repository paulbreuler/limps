import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { loadConfig } from '../../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../../utils/config-resolver.js';
import { openGraphDb } from '../../cli/graph-db.js';
import { startGraphWatch } from '../../cli/graph-watch.js';

export const description = 'Watch for changes and update graph';

export const args = z.tuple([]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  project: z.string().optional().describe('Registered project name'),
  channels: z
    .string()
    .optional()
    .describe('Notification channels (comma-separated: log,file,webhook)'),
  'webhook-url': z.string().optional().describe('Webhook URL for notifications'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function GraphWatchCommand({ options }: Props): React.ReactNode {
  const configPath = options.project
    ? resolveProjectConfigPath(options.project)
    : resolveConfigPath(options.config);
  const config = loadConfig(configPath);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = openGraphDb(config);
    const channels = options.channels?.split(',').map((c) => c.trim()) ?? ['log'];

    let watcherRef: Awaited<ReturnType<typeof startGraphWatch>> | null = null;
    let cancelled = false;

    const startWatcherAsync = async (): Promise<void> => {
      try {
        const w = await startGraphWatch(config, db, {
          channels,
          webhookUrl: options['webhook-url'],
        });
        if (cancelled) {
          // Cleanup ran before watcher started - stop immediately
          await w.stop();
          db.close();
        } else {
          watcherRef = w;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Failed to start graph watcher:', err);
        if (!cancelled) {
          setError(message);
        }
      }
    };

    void startWatcherAsync();

    const cleanup = (): void => {
      cancelled = true;
      if (watcherRef) {
        void watcherRef
          .stop()
          .then(() => db.close())
          .catch(() => db.close());
      } else {
        db.close();
      }
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    return (): void => {
      cleanup();
      process.removeListener('SIGINT', cleanup);
      process.removeListener('SIGTERM', cleanup);
    };
  }, [config, options.channels, options['webhook-url']]);

  if (error) {
    return (
      <Text>
        <Text color="red">Error:</Text> Failed to start watcher: {error}
      </Text>
    );
  }

  return (
    <Text>
      <Text color="cyan">Watching</Text> {config.plansPath} for changes...
      {'\n'}Press Ctrl+C to stop.
    </Text>
  );
}
