import { Text } from 'ink';
import { z } from 'zod';
import { configUpgrade } from '../../cli/config-cmd.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';

export const description = 'Upgrade config schema to the latest version';

export const options = z.object({
  all: z.boolean().optional().describe('Upgrade all registered projects'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function ConfigUpgradeCommand({ options }: Props): React.ReactNode {
  try {
    const output = configUpgrade(() => resolveConfigPath(), { all: options.all });
    return <Text>{output}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
