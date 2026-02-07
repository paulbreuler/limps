import { Text } from 'ink';
import { z } from 'zod';
import { configUpgrade } from '../../cli/config-cmd.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';

export const description = 'Upgrade config schema to the latest version';

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function ConfigUpgradeCommand({ options }: Props): React.ReactNode {
  try {
    const output = configUpgrade(() => resolveConfigPath(options.config));
    return <Text>{output}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
