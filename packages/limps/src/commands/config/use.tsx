import { Text } from 'ink';
import { z } from 'zod';
import { configUse } from '../../cli/config-cmd.js';

export const description = 'Set the current/default project';

export const args = z.tuple([z.string().describe('Project name')]);

interface Props {
  args: z.infer<typeof args>;
}

export default function ConfigUseCommand({ args }: Props): React.ReactNode {
  const [name] = args;

  try {
    const output = configUse(name);
    return <Text color="green">{output}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
