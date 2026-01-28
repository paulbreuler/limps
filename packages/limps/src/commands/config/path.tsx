import { Text } from 'ink';
import { configPath } from '../../cli/config-cmd.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';

export const description = 'Print the resolved config file path';

export default function ConfigPathCommand(): React.ReactNode {
  const output = configPath(() => resolveConfigPath());
  return <Text>{output}</Text>;
}
