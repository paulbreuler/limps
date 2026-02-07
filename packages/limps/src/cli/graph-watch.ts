import type { Database as DatabaseType } from 'better-sqlite3';
import type { ServerConfig } from '../config.js';
import { GraphStorage } from '../graph/storage.js';
import { GraphWatcher, type GraphWatcherOptions } from '../graph/watcher.js';
import type { NotifierConfig } from '../graph/notifier.js';

export interface GraphWatchOptions {
  channels?: string[];
  webhookUrl?: string;
  filePath?: string;
}

export async function startGraphWatch(
  config: ServerConfig,
  db: DatabaseType,
  options?: GraphWatchOptions
): Promise<GraphWatcher> {
  const storage = new GraphStorage(db);

  const channels = (options?.channels ?? ['log']) as NotifierConfig['channels'];

  const watcherOptions: GraphWatcherOptions = {
    plansPath: config.plansPath,
    notifierConfig: {
      channels,
      webhookUrl: options?.webhookUrl,
      filePath: options?.filePath,
    },
  };

  const watcher = new GraphWatcher(storage, watcherOptions);
  await watcher.start();
  return watcher;
}
