import { Text } from 'ink';
import { useEffect } from 'react';
import { z } from 'zod';
import { configList, getProjectsData } from '../../cli/config-cmd.js';
import { handleJsonOutput, isJsonMode } from '../../cli/json-output.js';

export const description = 'Show all registered projects';

export const options = z.object({
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function ConfigListCommand({ options }: Props): React.ReactNode {
  const jsonMode = isJsonMode(options);
  useEffect((): (() => void) | undefined => {
    if (jsonMode) {
      const timer = setTimeout(() => {
        handleJsonOutput(() => getProjectsData(), 'CONFIG_LIST_ERROR');
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [jsonMode]);

  if (jsonMode) {
    return null;
  }

  const output = configList();
  return <Text>{output}</Text>;
}
