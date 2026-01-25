import { Text } from 'ink';
import { z } from 'zod';
import { listAgents } from '../cli/list-agents.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';

export const description = 'List agents in a plan';

export const args = z.tuple([z.string().describe('Plan ID or name')]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function ListAgentsCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;

  try {
    const configPath = resolveConfigPath(options.config);
    const config = loadConfig(configPath);
    const output = listAgents(config, planId);
    return <Text>{output}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
