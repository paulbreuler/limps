import { Text } from 'ink';
import { useEffect } from 'react';
import { z } from 'zod';
import { getScoredTasksData } from '../cli/next-task.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../utils/config-resolver.js';
import { buildHelpOutput, getProjectLlmHints, getProjectTipLine } from '../utils/cli-help.js';
import { isJsonMode, outputJson, wrapSuccess, wrapError } from '../cli/json-output.js';

export const description = 'Compare scores across all available tasks';

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

export default function ScoreAllCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;
  const help = buildHelpOutput({
    usage: 'limps score-all <plan> [options]',
    arguments: ['plan Plan ID or name (e.g., "4" or "0004-feature-name")'],
    options: [
      '--config Path to config file',
      '--project Registered project name',
      '--json Output as JSON',
    ],
    examples: [
      'limps score-all 4',
      'limps score-all 0004-feature-name --project runi-planning-docs',
      'limps score-all 4 --json',
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
