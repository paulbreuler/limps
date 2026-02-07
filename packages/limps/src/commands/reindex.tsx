import { Text } from 'ink';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { loadConfig, getAllDocsPaths, getFileExtensions } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { initializeDatabase, createSchema, clearIndex, indexAllPaths } from '../indexer.js';

export const description = 'Clear and rebuild the document search index';

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function ReindexCommand({ options }: Props): React.ReactNode {
  const [result, setResult] = useState<{
    indexed: number;
    updated: number;
    skipped: number;
    errors: { path: string; error: string }[];
    paths: string[];
    extensions: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async (): Promise<void> => {
      let db: ReturnType<typeof initializeDatabase> | null = null;
      try {
        const configPath = resolveConfigPath(options.config);
        const config = loadConfig(configPath);
        mkdirSync(config.dataPath, { recursive: true });
        const dbPath = resolve(config.dataPath, 'documents.sqlite');
        db = initializeDatabase(dbPath);
        createSchema(db);

        const docsPaths = getAllDocsPaths(config);
        const fileExtensions = getFileExtensions(config);
        const ignorePatterns = ['.git', 'node_modules', '.tmp', '.obsidian'];

        clearIndex(db);
        const indexingResult = await indexAllPaths(db, docsPaths, fileExtensions, ignorePatterns);

        setResult({
          indexed: indexingResult.indexed,
          updated: indexingResult.updated,
          skipped: indexingResult.skipped,
          errors: indexingResult.errors,
          paths: docsPaths,
          extensions: fileExtensions,
        });
      } catch (err) {
        setError((err as Error).message);
      } finally {
        if (db) {
          db.close();
        }
      }
    };

    void run();
  }, [options.config]);

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (!result) {
    return <Text>Reindexing...</Text>;
  }

  return (
    <Text>
      Reindexed {result.indexed} documents ({result.updated} updated, {result.skipped} skipped).
      {'\n'}
      Paths: {result.paths.join(', ')}
      {'\n'}
      Extensions: {result.extensions.join(', ')}
      {result.errors.length > 0 ? `\nErrors: ${result.errors.length}` : ''}
    </Text>
  );
}
