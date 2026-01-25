import { Text } from 'ink';
import { configList } from '../../cli/config-cmd.js';

export const description = 'Show all registered projects';

export default function ConfigListCommand(): React.ReactNode {
  const output = configList();
  return <Text>{output}</Text>;
}
