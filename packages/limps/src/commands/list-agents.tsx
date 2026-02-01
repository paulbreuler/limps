import { Text } from 'ink';
import { useEffect } from 'react';
import { z } from 'zod';
import { getAgentsData } from '../cli/list-agents.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../utils/config-resolver.js';
import { buildHelpOutput, getProjectLlmHints, getProjectTipLine } from '../utils/cli-help.js';
import { AgentsList } from '../components/AgentsList.js';
import { handleJsonOutput, isJsonMode, outputJson, wrapError } from '../cli/json-output.js';

export const description = 'List agents in a plan';

export const args = z.tuple([z.string().describe('plan id or name').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  project: z.string().optional().describe('Registered project name'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function ListAgentsCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;
  const help = buildHelpOutput({
    usage: 'limps list-agents <plan> [options]',
    arguments: ['plan Plan ID or name (e.g., "4" or "0004-feature-name")'],
    options: [
      '--config Path to config file',
      '--project Registered project name',
      '--json Output as JSON',
    ],
    examples: [
      'limps list-agents 4',
      'limps list-agents 0004-my-feature',
      'limps list-agents 4 --json',
    ],
    tips: [getProjectTipLine()],
    llmHints: getProjectLlmHints(),
  });

  const jsonMode = isJsonMode(options);
  useEffect((): (() => void) | undefined => {
    if (!jsonMode) {
      return;
    }
    const timer = setTimeout(() => {
      try {
        if (!planId) {
          outputJson(
            wrapError('Plan ID is required', { code: 'MISSING_PLAN_ID', help: help.meta }),
            1
          );
        }
        const configPath = options.project
          ? resolveProjectConfigPath(options.project)
          : resolveConfigPath(options.config);
        const config = loadConfig(configPath);
        handleJsonOutput(() => {
          const result = getAgentsData(config, planId);
          if ('error' in result) {
            throw new Error(result.error);
          }
          return result;
        }, 'LIST_AGENTS_ERROR');
      } catch (error) {
        outputJson(
          wrapError(error instanceof Error ? error.message : String(error), {
            code: 'LIST_AGENTS_ERROR',
          }),
          1
        );
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [help.meta, jsonMode, options.config, options.project, planId]);

  if (jsonMode) {
    return null;
  }

  if (!planId) {
    return <Text>{help.text}</Text>;
  }

  try {
    const configPath = options.project
      ? resolveProjectConfigPath(options.project)
      : resolveConfigPath(options.config);
    const config = loadConfig(configPath);
    const result = getAgentsData(config, planId);

    if ('error' in result) {
      return <Text color="red">Error: {result.error}</Text>;
    }

    return (
      <AgentsList
        planName={result.planName}
        agents={result.agents}
        statusCounts={result.statusCounts}
        total={result.total}
      />
    );
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
