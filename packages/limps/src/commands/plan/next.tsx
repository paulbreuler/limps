import { Text } from 'ink';
import { z } from 'zod';
import { useState, useEffect } from 'react';
import { getNextTaskData, type TaskScoreBreakdown } from '../../cli/next-task.js';
import { loadCommandContext } from '../../core/command-context.js';
import { buildHelpOutput } from '../../utils/cli-help.js';
import { NextTask } from '../../components/NextTask.js';
import { isJsonMode, outputJson, wrapSuccess, wrapError } from '../../cli/json-output.js';

export const description = 'Get the next best task';

export const args = z.tuple([z.string().describe('plan id or name').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function NextTaskCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;
  const help = buildHelpOutput({
    usage: 'limps plan next <plan> [options]',
    arguments: ['plan Plan ID or name (e.g., "4" or "0004-feature-name")'],
    options: ['--config Path to config file', '--json Output as JSON'],
    examples: ['limps plan next 4', 'limps plan next 0004-my-feature', 'limps plan next 4 --json'],
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
          const { config } = loadCommandContext(options.config);
          const data = await getNextTaskData(config, planId, { suppressWarnings: true });
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
  }, [help.meta, jsonMode, options.config, planId]);

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
        const { config } = loadCommandContext(options.config);
        const data = await getNextTaskData(config, planId);
        setResult(data);
      } catch (err) {
        setError((err as Error).message);
      }
    };
    void run();
  }, [planId, options.config]);

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
