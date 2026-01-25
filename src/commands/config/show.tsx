import { Text } from 'ink';
import { configShow } from '../../cli/config-cmd.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';

export const description = 'Display resolved configuration values';

export default function ConfigShowCommand(): React.ReactNode {
  try {
    const output = configShow(() => resolveConfigPath());
    return <Text>{output}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
