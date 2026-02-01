import { Text } from 'ink';
import { z } from 'zod';
import { useState, useEffect } from 'react';
import { getNextTaskData, type TaskScoreBreakdown } from '../cli/next-task.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../utils/config-resolver.js';
import { buildHelpOutput, getProjectLlmHints, getProjectTipLine } from '../utils/cli-help.js';
import { NextTask } from '../components/NextTask.js';
import { isJsonMode, outputJson, wrapSuccess, wrapError } from '../cli/json-output.js';

export const description = 'Get the next best task';

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

export default function NextTaskCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;
  const help = buildHelpOutput({
    usage: 'limps next-task <plan> [options]',
    arguments: ['plan Plan ID or name (e.g., "4" or "0004-feature-name")'],
    options: [
      '--config Path to config file',
      '--project Registered project name',
      '--json Output as JSON',
    ],
    examples: ['limps next-task 4', 'limps next-task 0004-my-feature', 'limps next-task 4 --json'],
    sections: [
      {
        title: 'Scoring Algorithm',
        lines: [
          'Dependency Score: 40 pts (all deps satisfied)',
          'Priority Score: 30 pts (lower agent # = higher)',
          'Workload Score: 30 pts (fewer files = higher)',
        ],
      },
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
      const run = async (): Promise<void> => {
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
          const data = await getNextTaskData(config, planId);
          if ('error' in data) {
            outputJson(wrapError(data.error, { code: 'NEXT_TASK_ERROR' }), 1);
          }
          outputJson(wrapSuccess(data));
        } catch (error) {
          outputJson(
            wrapError(error instanceof Error ? error.message : String(error), {
              code: 'NEXT_TASK_ERROR',
            }),
            1
          );
        }
      };
      void run();
    }, 0);
    return () => clearTimeout(timer);
  }, [help.meta, jsonMode, options.config, options.project, planId]);

  if (jsonMode) {
    return null;
  }

  if (!planId) {
    return <Text>{help.text}</Text>;
  }
  const [result, setResult] = useState<
    { task: TaskScoreBreakdown; otherAvailableTasks: number } | { error: string } | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async (): Promise<void> => {
      try {
        const configPath = options.project
          ? resolveProjectConfigPath(options.project)
          : resolveConfigPath(options.config);
        const config = loadConfig(configPath);
        const data = await getNextTaskData(config, planId);
        setResult(data);
      } catch (err) {
        setError((err as Error).message);
      }
    };
    void run();
  }, [planId, options.config, options.project]);

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (!result) {
    return <Text>Loading...</Text>;
  }

  if ('error' in result) {
    return <Text color="red">{result.error}</Text>;
  }

  return <NextTask task={result.task} otherAvailableTasks={result.otherAvailableTasks} />;
}
