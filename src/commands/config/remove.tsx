import { Text } from 'ink';
import { z } from 'zod';
import { configRemove } from '../../cli/config-cmd.js';

export const description = 'Unregister a project (keeps files)';

export const args = z.tuple([z.string().describe('Project name')]);

interface Props {
  args: z.infer<typeof args>;
}

export default function ConfigRemoveCommand({ args }: Props): React.ReactNode {
  const [name] = args;

  try {
    const output = configRemove(name);
    return <Text color="green">{output}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
