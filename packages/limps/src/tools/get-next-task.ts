import { z } from 'zod';
import { getNextTaskData } from '../cli/next-task.js';
import type { ToolContext, ToolResult } from '../types.js';
import type { ScoringBiases, ScoringWeights } from '../config.js';

/**
 * Input schema for get_next_task tool.
 *
 * Uses scoring algorithm with breakdown:
 * - Dependency Score: 40 points max (all-or-nothing)
 * - Priority Score: 30 points max (based on agent number)
 * - Workload Score: 30 points max (based on file count)
 */
export const GetNextTaskInputSchema = z.object({
  planId: z.string().describe('Plan number or name to search within (e.g., "4" or "0004-feature")'),
  prettyPrint: z
    .boolean()
    .default(false)
    .describe('Format JSON response with indentation (default: false)'),
});

/**
 * Task score interface.
 */
export interface TaskScore {
  taskId: string;
  score: number;
  reasons: string[];
}

const hasWeightOverrides = (weights: Partial<ScoringWeights> | undefined): boolean => {
  if (!weights) {
    return false;
  }
  return (
    weights.dependency !== undefined ||
    weights.priority !== undefined ||
    weights.workload !== undefined
  );
};

const hasBiasOverrides = (biases: Partial<ScoringBiases> | undefined): boolean => {
  if (!biases) {
    return false;
  }
  const hasPlans = biases.plans && Object.keys(biases.plans).length > 0;
  const hasPersonas =
    biases.personas && Object.values(biases.personas).some((value) => value !== undefined);
  const hasStatuses =
    biases.statuses && Object.values(biases.statuses).some((value) => value !== undefined);
  return Boolean(hasPlans || hasPersonas || hasStatuses);
};

const getConfigUsed = (context: ToolContext): string => {
  const preset = context.config.scoring.preset;
  if (preset && preset !== 'default') {
    return preset;
  }
  if (
    hasWeightOverrides(context.config.scoring.weights) ||
    hasBiasOverrides(context.config.scoring.biases)
  ) {
    return 'custom';
  }
  return 'default';
};

const buildFactorBreakdown = (
  score: number,
  weight: number
): { raw: number; weighted: number; weight: number } => ({
  raw: weight > 0 ? score / weight : 0,
  weighted: score,
  weight,
});

/**
 * Handle get_next_task tool request.
 * Returns the highest-priority available task based on scoring algorithm.
 *
 * Uses agent frontmatter for status and dependencies.
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result with detailed score breakdown
 */
export async function handleGetNextTask(
  input: z.infer<typeof GetNextTaskInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const { planId, prettyPrint = false } = input;

  const result = await getNextTaskData(context.config, planId);

  if ('error' in result) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              taskId: null,
              message: result.error,
            },
            null,
            prettyPrint ? 2 : undefined
          ),
        },
      ],
      isError: result.error.includes('not found'),
    };
  }

  const { task, otherAvailableTasks } = result;
  const configUsed = getConfigUsed(context);
  const breakdown = {
    dependency: buildFactorBreakdown(task.dependencyScore, task.weights.dependency),
    priority: buildFactorBreakdown(task.priorityScore, task.weights.priority),
    workload: buildFactorBreakdown(task.workloadScore, task.weights.workload),
    biases: {
      plan: task.biasBreakdown.plan,
      persona: task.biasBreakdown.persona,
      status: task.biasBreakdown.status,
      agent: task.biasBreakdown.agent,
    },
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            taskId: task.taskId,
            title: task.title,
            totalScore: task.totalScore,
            dependencyScore: task.dependencyScore,
            priorityScore: task.priorityScore,
            workloadScore: task.workloadScore,
            reasons: task.reasons,
            breakdown,
            configUsed,
            otherAvailableTasks,
          },
          null,
          prettyPrint ? 2 : undefined
        ),
      },
    ],
  };
}
