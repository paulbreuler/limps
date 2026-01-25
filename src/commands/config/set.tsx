import { Text } from 'ink';
import { z } from 'zod';
import { configSet } from '../../cli/config-cmd.js';

export const description = 'Set current from config path (auto-registers)';

export const args = z.tuple([z.string().describe('Path to config file')]);

interface Props {
  args: z.infer<typeof args>;
}

export default function ConfigSetCommand({ args }: Props): React.ReactNode {
  const [configPath] = args;

  try {
    const output = configSet(configPath);
    return <Text color="green">{output}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
