import { Text } from 'ink';
import { z } from 'zod';
import { initProject } from '../cli/init-project.js';

export const description = 'Initialize limps in a directory';

export const args = z.tuple([
  z.string().describe('Path to initialize (defaults to current directory)').optional(),
]);

export const options = z.object({});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function InitCommand({ args }: Props): React.ReactNode {
  const [targetPath] = args;

  try {
    const output = initProject(targetPath);
    return <Text>{output}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
