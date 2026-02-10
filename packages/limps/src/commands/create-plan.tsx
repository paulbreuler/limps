import { Text } from 'ink';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { initializeDatabase, createSchema } from '../indexer.js';
import { handleCreatePlan } from '../tools/create-plan.js';
import type { ToolContext } from '../types.js';

export const description = 'Create a new plan with directory structure';

export const args = z.tuple([z.string().min(1).max(100).describe('Plan name')]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  description: z.string().optional().describe('Plan description'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function CreatePlanCommand({ args, options }: Props): React.ReactNode {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async (): Promise<void> => {
      let db: ReturnType<typeof initializeDatabase> | null = null;
      try {
        const [name] = args;
        const configPath = resolveConfigPath(options.config);
        const config = loadConfig(configPath);
        mkdirSync(config.dataPath, { recursive: true });
        const dbPath = resolve(config.dataPath, 'documents.sqlite');
        db = initializeDatabase(dbPath);
        createSchema(db);

        const context: ToolContext = {
          db,
          config,
        };

        const toolResult = await handleCreatePlan(
          {
            name,
            description: options.description,
          },
          context
        );

        if (toolResult.isError) {
          setError(toolResult.content[0].text);
        } else {
          setResult(toolResult.content[0].text);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        if (db) {
          db.close();
        }
      }
    };

    void run();
  }, [args, options.config, options.description]);

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (!result) {
    return <Text>Creating plan...</Text>;
  }

  return <Text color="green">{result}</Text>;
}
