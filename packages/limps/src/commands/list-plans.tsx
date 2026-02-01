import { Box, Text } from 'ink';
import { useEffect } from 'react';
import { z } from 'zod';
import { getPlansData } from '../cli/list-plans.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../utils/config-resolver.js';
import { PlansList } from '../components/PlansList.js';
import { getProjectTipLine } from '../utils/cli-help.js';
import { handleJsonOutput, isJsonMode, outputJson, wrapError } from '../cli/json-output.js';

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
  const jsonMode = isJsonMode(options);
  useEffect((): (() => void) | undefined => {
    if (jsonMode) {
      const timer = setTimeout(() => {
        try {
          const configPath = options.project
            ? resolveProjectConfigPath(options.project)
            : resolveConfigPath(options.config);
          const config = loadConfig(configPath);
          handleJsonOutput(() => {
            const result = getPlansData(config);
            if ('error' in result) {
              throw new Error(result.error);
            }
            return result;
          }, 'LIST_PLANS_ERROR');
        } catch (error) {
          outputJson(
            wrapError(error instanceof Error ? error.message : String(error), {
              code: 'LIST_PLANS_ERROR',
            }),
            1
          );
        }
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [jsonMode, options.config, options.project]);

  if (jsonMode) {
    return null;
  }

  const configPath = options.project
    ? resolveProjectConfigPath(options.project)
    : resolveConfigPath(options.config);
  const config = loadConfig(configPath);

  // Normal Ink rendering
  const result = getPlansData(config);

  if ('error' in result) {
    return <Text color="red">{result.error}</Text>;
  }

  return (
    <Box flexDirection="column">
      <PlansList plans={result.plans} total={result.total} />
      <Text>{getProjectTipLine()}</Text>
    </Box>
  );
}
