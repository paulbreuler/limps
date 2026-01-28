import { Text } from 'ink';
import { z } from 'zod';
import { configAdd } from '../../cli/config-cmd.js';

export const description = 'Register a config file or directory';

export const args = z.tuple([
  z.string().describe('Project name'),
  z.string().describe('Path to config file or directory'),
]);

interface Props {
  args: z.infer<typeof args>;
}

export default function ConfigAddCommand({ args }: Props): React.ReactNode {
  const [name, configPath] = args;

  try {
    const output = configAdd(name, configPath);
    return <Text color="green">{output}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
