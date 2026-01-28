import { Text } from 'ink';
import { z } from 'zod';
import { configShow, getConfigData } from '../../cli/config-cmd.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';
import { handleJsonOutput, isJsonMode } from '../../cli/json-output.js';

export const description = 'Display resolved configuration values';

export const options = z.object({
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function ConfigShowCommand({ options }: Props): React.ReactNode {
  // Handle JSON output mode
  if (isJsonMode(options)) {
    handleJsonOutput(() => {
      return getConfigData(() => resolveConfigPath());
    }, 'CONFIG_SHOW_ERROR');
  }

  try {
    const output = configShow(() => resolveConfigPath());
    return <Text>{output}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
