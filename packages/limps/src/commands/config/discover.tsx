import { Text } from 'ink';
import { configDiscover } from '../../cli/config-cmd.js';

export const description = 'Find and register configs in default locations';

export default function ConfigDiscoverCommand(): React.ReactNode {
  const output = configDiscover();
  return <Text>{output}</Text>;
}
