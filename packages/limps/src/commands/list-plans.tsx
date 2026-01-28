import { Text } from 'ink';
import { z } from 'zod';
import { getPlansData } from '../cli/list-plans.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { PlansList } from '../components/PlansList.js';
import { handleJsonOutput, isJsonMode } from '../cli/json-output.js';

export const description = 'List all plans';

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function ListPlansCommand({ options }: Props): React.ReactNode {
  const configPath = resolveConfigPath(options.config);
  const config = loadConfig(configPath);

  // Handle JSON output mode - bypass Ink rendering entirely
  if (isJsonMode(options)) {
    handleJsonOutput(() => {
      const result = getPlansData(config);
      if ('error' in result) {
        throw new Error(result.error);
      }
      return result;
    }, 'LIST_PLANS_ERROR');
  }

  // Normal Ink rendering
  const result = getPlansData(config);

  if ('error' in result) {
    return <Text color="red">{result.error}</Text>;
  }

  return <PlansList plans={result.plans} total={result.total} />;
}
