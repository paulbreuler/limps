import React, { useEffect } from 'react';
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

  useEffect(() => {
    const db = openGraphDb(config);
    const channels = options.channels?.split(',').map((c) => c.trim()) ?? ['log'];

    const watcher = startGraphWatch(config, db, {
      channels,
      webhookUrl: options['webhook-url'],
    });

    const cleanup = (): void => {
      void watcher
        .stop()
        .then(() => db.close())
        .catch(() => db.close());
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    return (): void => {
      cleanup();
      process.removeListener('SIGINT', cleanup);
      process.removeListener('SIGTERM', cleanup);
    };
  }, [config, options.channels, options['webhook-url']]);

  return (
    <Text>
      <Text color="cyan">Watching</Text> {config.plansPath} for changes...
      {'\n'}Press Ctrl+C to stop.
    </Text>
  );
}
