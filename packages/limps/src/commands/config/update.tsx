import { Text } from 'ink';
import { z } from 'zod';
import { configUpdate } from '../../cli/config-cmd.js';

export const description = 'Update a project configuration (plansPath, docsPaths)';

export const args = z.tuple([z.string().describe('Project name to update')]);

export const options = z.object({
  plansPath: z.string().optional().describe('New plans directory path'),
  docsPath: z.string().optional().describe('New docs directory path (replaces docsPaths array)'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function ConfigUpdateCommand({ args, options }: Props): React.ReactNode {
  const [projectName] = args;

  try {
    const output = configUpdate(projectName, {
      plansPath: options.plansPath,
      docsPath: options.docsPath,
    });
    return <Text color="green">{output}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
