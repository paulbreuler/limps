import { Text } from 'ink';
import { z } from 'zod';
import { getScoredTasksData } from '../cli/next-task.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../utils/config-resolver.js';
import { buildHelpText } from '../utils/cli-help.js';
import { isJsonMode, outputJson, wrapSuccess, wrapError } from '../cli/json-output.js';

export const description = 'Compare scores across all available tasks';

export const args = z.tuple([z.string().describe('plan id or name')]);

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

  if (!planId) {
    if (isJsonMode(options)) {
      return outputJson(wrapError('Plan ID is required', { code: 'MISSING_PLAN_ID' }), 1);
    }

    return (
      <Text>
        {buildHelpText({
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
        })}
      </Text>
    );
  }

  if (isJsonMode(options)) {
    const configPath = options.project
      ? resolveProjectConfigPath(options.project)
      : resolveConfigPath(options.config);
    const config = loadConfig(configPath);
    const result = getScoredTasksData(config, planId);
    if ('error' in result) {
      return outputJson(wrapError(result.error, { code: 'SCORE_ALL_ERROR' }), 1);
    }
    return outputJson(wrapSuccess(result));
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
