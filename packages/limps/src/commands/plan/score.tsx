import { Text } from 'ink';
import { useEffect } from 'react';
import { z } from 'zod';
import { getScoredTaskById } from '../../cli/next-task.js';
import { loadCommandContext } from '../../core/command-context.js';
import { resolveTaskIdFromPlanAndAgent } from '../../core/task-target.js';
import { buildHelpOutput } from '../../utils/cli-help.js';
import { isJsonMode, outputJson, wrapSuccess, wrapError } from '../../cli/json-output.js';

export const description = 'Show scoring breakdown for a specific agent task';

export const args = z.tuple([]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().describe('Output as JSON'),
  plan: z.string().optional().describe('Plan ID or name (e.g., "4" or "0004-feature-name")'),
  agent: z.string().optional().describe('Agent number (e.g., "3" or "003")'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function ScoreTaskCommand({ args, options }: Props): React.ReactNode {
  void args;
  const { plan: planId, agent: agentId } = options;
  const help = buildHelpOutput({
    usage: 'limps plan score --plan <plan> --agent <agent> [options]',
    options: [
      '--plan Plan ID or name (required)',
      '--agent Agent number in the plan (required)',
      '--config Path to config file',
      '--json Output as JSON',
    ],
    examples: [
      'limps plan score --plan 4 --agent 3',
      'limps plan score --plan 0004-feature-name --agent 003',
      'limps plan score --plan 4 --agent 3 --json',
    ],
    tips: [
      'Use short IDs for convenience: --plan 4 --agent 3',
      'For all candidate tasks in a plan, run: limps plan scores --plan 4',
    ],
  });
  const jsonMode = isJsonMode(options);

  useEffect((): (() => void) | undefined => {
    if (!jsonMode) {
      return;
    }
    const timer = setTimeout(() => {
      try {
        if (!planId || !agentId) {
          outputJson(
            wrapError('--plan and --agent are required', {
              code: 'MISSING_PLAN_OR_AGENT',
              help: help.meta,
            }),
            1
          );
          return;
        }
        const { config } = loadCommandContext(options.config);
        const taskId = resolveTaskIdFromPlanAndAgent(config, planId, agentId);
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
  }, [agentId, help.meta, jsonMode, options.config, planId]);

  if (jsonMode) {
    return null;
  }

  if (!planId || !agentId) {
    return (
      <Text>
        <Text color="red">Error: --plan and --agent are required</Text>
        {'\n\n'}
        {help.text}
      </Text>
    );
  }

  try {
    const { config } = loadCommandContext(options.config);
    const taskId = resolveTaskIdFromPlanAndAgent(config, planId, agentId);
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
