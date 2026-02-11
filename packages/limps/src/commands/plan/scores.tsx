import { Text } from 'ink';
import { useEffect } from 'react';
import { z } from 'zod';
import { getScoredTasksData } from '../../cli/next-task.js';
import { loadCommandContext } from '../../core/command-context.js';
import { buildHelpOutput } from '../../utils/cli-help.js';
import { isJsonMode, outputJson, wrapSuccess, wrapError } from '../../cli/json-output.js';

export const description = 'Compare scores across all available tasks';

export const args = z.tuple([]);

export const options = z.object({
  plan: z.string().optional().describe('Plan ID or name (e.g., "4" or "0004-feature-name")'),
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function ScoreAllCommand({ args, options }: Props): React.ReactNode {
  void args;
  const planId = options.plan;
  const help = buildHelpOutput({
    usage: 'limps plan scores --plan <plan> [options]',
    options: [
      '--plan Plan ID or name (required)',
      '--config Path to config file',
      '--json Output as JSON',
    ],
    examples: [
      'limps plan scores --plan 4',
      'limps plan scores --plan 0004-feature-name',
      'limps plan scores --plan 4 --json',
    ],
    tips: ['Use limps plan score --plan <plan> --agent <agent> for one task.'],
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
            wrapError('--plan is required', { code: 'MISSING_PLAN_ID', help: help.meta }),
            1
          );
          return;
        }
        const { config } = loadCommandContext(options.config);
        const result = getScoredTasksData(config, planId, { suppressWarnings: true });
        if ('error' in result) {
          outputJson(wrapError(result.error, { code: 'SCORE_ALL_ERROR' }), 1);
        }
        outputJson(wrapSuccess(result));
      } catch (error) {
        outputJson(
          wrapError(error instanceof Error ? error.message : String(error), {
            code: 'SCORE_ALL_ERROR',
          }),
          1
        );
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [help.meta, jsonMode, options.config, planId]);

  if (jsonMode) {
    return null;
  }

  if (!planId) {
    return (
      <Text>
        <Text color="red">Error: --plan is required</Text>
        {'\n\n'}
        {help.text}
      </Text>
    );
  }

  try {
    const { config } = loadCommandContext(options.config);
    const result = getScoredTasksData(config, planId);
    if ('error' in result) {
      return <Text color="red">{result.error}</Text>;
    }

    const { planName, tasks } = result;
    const lines: string[] = [];
    lines.push(`Task Scores (${planName}):`);
    lines.push('');

    const topTaskId = tasks[0]?.taskId;
    for (const task of tasks) {
      const marker = task.taskId === topTaskId ? '*' : ' ';
      lines.push(
        `[${marker}] ${task.taskId} | ${task.title} | total ${task.totalScore}${
          task.biasScore ? ` (bias ${task.biasScore > 0 ? '+' : ''}${task.biasScore})` : ''
        }`
      );
    }

    lines.push('');
    lines.push(`Total tasks scored: ${tasks.length}`);
    lines.push(`[${topTaskId ? '*' : ' '}] = Next best task`);

    return <Text>{lines.join('\n')}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
