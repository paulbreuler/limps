import { Text } from 'ink';
import { z } from 'zod';
import { listPlans } from '../cli/list-plans.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';

export const description = 'List all plans';

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function ListPlansCommand({ options }: Props): React.ReactNode {
  const configPath = resolveConfigPath(options.config);
  const config = loadConfig(configPath);
  const output = listPlans(config);
  return <Text>{output}</Text>;
}
