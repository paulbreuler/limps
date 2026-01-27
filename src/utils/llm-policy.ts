export type LlmPolicy = 'auto' | 'force';

export interface SubQueryDecisionInput {
  allowLlm: boolean;
  policy?: LlmPolicy;
  resultSizeBytes: number;
  minResultBytes?: number;
}

export interface SubQueryDecision {
  shouldRun: boolean;
  reason?: string;
}

const DEFAULT_MIN_RESULT_BYTES = 800;

/**
 * Decide whether to run LLM sub_query based on policy and result size.
 */
export function decideSubQueryExecution(input: SubQueryDecisionInput): SubQueryDecision {
  const { allowLlm, policy = 'auto', resultSizeBytes, minResultBytes } = input;

  if (!allowLlm) {
    return {
      shouldRun: false,
      reason: 'LLM disabled; set allow_llm=true to run sub_query.',
    };
  }

  if (policy === 'force') {
    return { shouldRun: true };
  }

  const threshold = minResultBytes ?? DEFAULT_MIN_RESULT_BYTES;
  if (resultSizeBytes < threshold) {
    return {
      shouldRun: false,
      reason: `Result under ${threshold} bytes; use JS processing or set llm_policy=force.`,
    };
  }

  return { shouldRun: true };
}
