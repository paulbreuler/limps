import { Text } from 'ink';
import { configDiscover } from '../../cli/config-cmd.js';

export const description =
  'Find configs in default locations (use `limps config use <name>` to register)';

export default function ConfigDiscoverCommand(): React.ReactNode {
  const output = configDiscover();
  return <Text>{output}</Text>;
}
