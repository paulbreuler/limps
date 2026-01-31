import { Text } from 'ink';
import { configMigrate } from '../../cli/config-cmd.js';

export const description =
  'Migrate known configs into limps/projects/ (from old locations or flat limps layout)';

export default function ConfigMigrateCommand(): React.ReactNode {
  try {
    const output = configMigrate();
    return <Text color="green">{output}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
