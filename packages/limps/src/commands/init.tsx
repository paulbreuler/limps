import { Text } from 'ink';
import { z } from 'zod';
import { initProject } from '../cli/init-project.js';

export const description = 'Initialize a new project';

export const args = z.tuple([z.string().describe('Project name')]);

export const options = z.object({
  docsPath: z.string().optional().describe('Path to documentation directory'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function InitCommand({ args, options }: Props): React.ReactNode {
  const [projectName] = args;

  try {
    const output = initProject(projectName, options.docsPath);
    return <Text>{output}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
