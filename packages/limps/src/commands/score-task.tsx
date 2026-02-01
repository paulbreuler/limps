import { Text } from 'ink';
import { useEffect } from 'react';
import { z } from 'zod';
import { getScoredTaskById } from '../cli/next-task.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../utils/config-resolver.js';
import { buildHelpOutput, getProjectLlmHints, getProjectTipLine } from '../utils/cli-help.js';
import { isJsonMode, outputJson, wrapSuccess, wrapError } from '../cli/json-output.js';

export const description = 'Show scoring breakdown for a task';

export const args = z.tuple([z.string().describe('task id (e.g., 0004-feature#001)').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  project: z.string().optional().describe('Registered project name'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function ScoreTaskCommand({ args, options }: Props): React.ReactNode {
  const [taskId] = args;
  const help = buildHelpOutput({
    usage: 'limps score-task <task-id> [options]',
    arguments: ['task-id Task ID (e.g., "0004-feature#001")'],
    options: [
      '--config Path to config file',
      '--project Registered project name',
      '--json Output as JSON',
    ],
    examples: [
      'limps score-task 0004-feature#001',
      'limps score-task 0004-feature#001 --project runi-planning-docs',
      'limps score-task 0004-feature#001 --json',
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
        if (!taskId) {
          outputJson(
            wrapError('Task ID is required', { code: 'MISSING_TASK_ID', help: help.meta }),
            1
          );
        }
        const configPath = options.project
          ? resolveProjectConfigPath(options.project)
          : resolveConfigPath(options.config);
        const config = loadConfig(configPath);
        const result = getScoredTaskById(config, taskId, { suppressWarnings: true });
        if ('error' in result) {
          outputJson(wrapError(result.error, { code: 'SCORE_TASK_ERROR' }), 1);
        }
        outputJson(wrapSuccess(result));
      } catch (error) {
        outputJson(
          wrapError(error instanceof Error ? error.message : String(error), {
            code: 'SCORE_TASK_ERROR',
          }),
          1
        );
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [help.meta, jsonMode, options.config, options.project, taskId]);

  if (jsonMode) {
    return null;
  }

  if (!taskId) {
    return <Text>{help.text}</Text>;
  }

  try {
    const configPath = options.project
      ? resolveProjectConfigPath(options.project)
      : resolveConfigPath(options.config);
    const config = loadConfig(configPath);
    const result = getScoredTaskById(config, taskId);
    if ('error' in result) {
      return <Text color="red">{result.error}</Text>;
    }

    const { planName, task } = result;
    const lines: string[] = [];
    lines.push(`Task Score (${planName}):`);
    lines.push('');
    lines.push(`  Task ID: ${task.taskId}`);
    lines.push(`  Title: ${task.title}`);
    lines.push('');
    lines.push('Score Breakdown:');
    lines.push(`  Total Score: ${task.totalScore}`);
    lines.push(`  Dependencies: ${task.dependencyScore}`);
    lines.push(`  Priority: ${task.priorityScore}`);
    lines.push(`  Workload: ${task.workloadScore}`);
    if (task.biasScore !== 0) {
      lines.push(`  Bias: ${task.biasScore > 0 ? '+' : ''}${task.biasScore}`);
    }
    lines.push('');
    lines.push('Scoring Reasons:');
    for (const reason of task.reasons) {
      lines.push(`  - ${reason}`);
    }

    return <Text>{lines.join('\n')}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
