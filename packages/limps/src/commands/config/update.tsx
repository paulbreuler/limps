import { Text } from 'ink';
import { z } from 'zod';
import { configUpdate } from '../../cli/config-cmd.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';

export const description = 'Update project configuration (plansPath, docsPaths)';

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  plansPath: z.string().optional().describe('New plans directory path'),
  docsPath: z.string().optional().describe('New docs directory path (replaces docsPaths array)'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function ConfigUpdateCommand({ options }: Props): React.ReactNode {
  try {
    const configPath = resolveConfigPath(options.config);
    const output = configUpdate(configPath, {
      plansPath: options.plansPath,
      docsPath: options.docsPath,
    });
    return <Text color="green">{output}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
