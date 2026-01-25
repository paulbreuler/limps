import { Text } from 'ink';
import { z } from 'zod';
import { useState, useEffect } from 'react';
import { nextTask } from '../cli/next-task.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';

export const description = 'Get the next best task';

export const args = z.tuple([z.string().describe('Plan ID or name')]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function NextTaskCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;
  const [output, setOutput] = useState<string>('Loading...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async (): Promise<void> => {
      try {
        const configPath = resolveConfigPath(options.config);
        const config = loadConfig(configPath);
        const result = await nextTask(config, planId);
        setOutput(result);
      } catch (err) {
        setError((err as Error).message);
      }
    };
    void run();
  }, [planId, options.config]);

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  return <Text>{output}</Text>;
}
