import { Text } from 'ink';
import { z } from 'zod';
import { getPlansData } from '../cli/list-plans.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../utils/config-resolver.js';
import { PlansList } from '../components/PlansList.js';
import { getProjectTipLine } from '../utils/cli-help.js';
import { handleJsonOutput, isJsonMode } from '../cli/json-output.js';

export const description = 'List all plans';

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  project: z.string().optional().describe('Registered project name'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function ListPlansCommand({ options }: Props): React.ReactNode {
  const configPath = options.project
    ? resolveProjectConfigPath(options.project)
    : resolveConfigPath(options.config);
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

  return (
    <Text>
      <PlansList plans={result.plans} total={result.total} />
      {'\n'}
      {getProjectTipLine()}
    </Text>
  );
}
