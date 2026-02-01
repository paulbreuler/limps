import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ToolContext, ToolResult } from '../types.js';
import {
  SCORING_PRESETS,
  type ScoringPreset,
  type ScoringWeights,
  type ScoringBiases,
  loadConfig,
} from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { configScoringUpdate, type ScoringConfigUpdateOptions } from '../cli/config-cmd.js';
import { findPlanDirectory } from '../cli/list-agents.js';
import { FrontmatterHandler } from '../utils/frontmatter.js';
import { findAgentFilePath, readAgentFile, updateAgentFrontmatter } from '../agent-parser.js';

const ScoringWeightsSchema = z
  .object({
    dependency: z.number().optional(),
    priority: z.number().optional(),
    workload: z.number().optional(),
  })
  .strict();

const ScoringBiasesSchema = z
  .object({
    plans: z.record(z.string(), z.number()).optional(),
    personas: z
      .object({
        coder: z.number().optional(),
        reviewer: z.number().optional(),
        pm: z.number().optional(),
        customer: z.number().optional(),
      })
      .strict()
      .optional(),
    statuses: z
      .object({
        GAP: z.number().optional(),
        WIP: z.number().optional(),
        BLOCKED: z.number().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const ConfigureScoringInputSchema = z
  .object({
    weights: ScoringWeightsSchema.optional(),
    biases: ScoringBiasesSchema.optional(),
    preset: z
      .enum(['default', 'quick-wins', 'dependency-chain', 'newest-first', 'code-then-review'])
      .optional(),
    scope: z.enum(['global', 'plan', 'agent']).default('global'),
    targetId: z.string().optional(),
  })
  .strict();

const frontmatterHandler = new FrontmatterHandler();

function formatResult(payload: Record<string, unknown>, isError = false): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
    isError,
  };
}

function hasWeightUpdates(weights: Partial<ScoringWeights> | undefined): boolean {
  if (!weights) {
    return false;
  }
  return (
    weights.dependency !== undefined ||
    weights.priority !== undefined ||
    weights.workload !== undefined
  );
}

function hasBiasUpdates(biases: Partial<ScoringBiases> | undefined): boolean {
  if (!biases) {
    return false;
  }
  const hasPlans = biases.plans && Object.keys(biases.plans).length > 0;
  const hasPersonas =
    biases.personas && Object.values(biases.personas).some((value) => value !== undefined);
  const hasStatuses =
    biases.statuses && Object.values(biases.statuses).some((value) => value !== undefined);
  return Boolean(hasPlans || hasPersonas || hasStatuses);
}

function validateWeights(weights: Partial<ScoringWeights> | undefined): string[] {
  if (!weights) {
    return [];
  }
  const errors: string[] = [];
  for (const [key, value] of Object.entries(weights)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`Weight "${key}" must be a finite number.`);
      continue;
    }
    if (value < 0) {
      errors.push(`Weight "${key}" must be non-negative.`);
    }
  }
  return errors;
}

function validateBiases(biases: Partial<ScoringBiases> | undefined): {
  errors: string[];
  warnings: string[];
} {
  const result = { errors: [] as string[], warnings: [] as string[] };
  if (!biases) {
    return result;
  }
  const pushWarning = (label: string, value: number): void => {
    if (Math.abs(value) > 50) {
      result.warnings.push(
        `Bias value for ${label} is outside the recommended range (-50 to 50): ${value}`
      );
    }
  };

  if (biases.plans) {
    for (const [plan, value] of Object.entries(biases.plans)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        result.errors.push(`Bias for plan "${plan}" must be a finite number.`);
        continue;
      }
      pushWarning(`plan "${plan}"`, value);
    }
  }

  if (biases.personas) {
    for (const [persona, value] of Object.entries(biases.personas)) {
      if (value === undefined) {
        continue;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        result.errors.push(`Bias for persona "${persona}" must be a finite number.`);
        continue;
      }
      pushWarning(`persona "${persona}"`, value);
    }
  }

  if (biases.statuses) {
    for (const [status, value] of Object.entries(biases.statuses)) {
      if (value === undefined) {
        continue;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        result.errors.push(`Bias for status "${status}" must be a finite number.`);
        continue;
      }
      pushWarning(`status "${status}"`, value);
    }
  }

  return result;
}

function resolveScopedBias(
  biases: Partial<ScoringBiases> | undefined,
  targetId: string
): { bias?: number; error?: string; warnings: string[] } {
  const warnings: string[] = [];
  if (!biases) {
    return { warnings };
  }

  if (biases.personas || biases.statuses) {
    return {
      warnings,
      error: 'Persona/status biases are only supported for global scope.',
    };
  }

  const plans = biases.plans ?? {};
  if (Object.keys(plans).length === 0) {
    return { warnings };
  }

  let biasValue: number | undefined;
  if (targetId in plans) {
    biasValue = plans[targetId];
  } else if (Object.keys(plans).length === 1) {
    biasValue = Object.values(plans)[0];
  } else {
    return {
      warnings,
      error: `Scoped bias requires a plan entry matching "${targetId}".`,
    };
  }

  if (biasValue !== undefined && Math.abs(biasValue) > 50) {
    warnings.push(
      `Bias value for "${targetId}" is outside the recommended range (-50 to 50): ${biasValue}`
    );
  }

  return { bias: biasValue, warnings };
}

function getPlanFilePath(planDir: string): string | null {
  const planFolder = planDir.split('/').pop();
  if (!planFolder) {
    return null;
  }
  const planFilePath = join(planDir, `${planFolder}-plan.md`);
  return existsSync(planFilePath) ? planFilePath : null;
}

export async function handleConfigureScoring(
  input: z.infer<typeof ConfigureScoringInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const scope = input.scope ?? 'global';
  const { targetId, preset, weights, biases } = input;

  if (!preset && !hasWeightUpdates(weights) && !hasBiasUpdates(biases)) {
    return formatResult({ error: 'No scoring changes specified.' }, true);
  }

  const weightErrors = validateWeights(weights);
  const biasValidation = validateBiases(biases);
  if (weightErrors.length > 0 || biasValidation.errors.length > 0) {
    return formatResult({ error: [...weightErrors, ...biasValidation.errors].join(' ') }, true);
  }

  if (scope !== 'global') {
    if (!targetId) {
      return formatResult({ error: 'Scoped updates require targetId.' }, true);
    }
    if (preset) {
      return formatResult({ error: 'Preset updates are only supported for global scope.' }, true);
    }
  }

  const warnings = [...biasValidation.warnings];

  if (scope === 'global') {
    if (preset && !SCORING_PRESETS[preset as ScoringPreset]) {
      return formatResult(
        {
          error: `Unknown preset: ${preset}. Valid presets: ${Object.keys(SCORING_PRESETS).join(
            ', '
          )}`,
        },
        true
      );
    }

    const configPath = resolveConfigPath();
    const updateOptions: ScoringConfigUpdateOptions = {};
    if (preset) {
      updateOptions.preset = preset as ScoringConfigUpdateOptions['preset'];
    }
    if (weights && hasWeightUpdates(weights)) {
      updateOptions.weights = weights;
    }
    if (biases && hasBiasUpdates(biases)) {
      updateOptions.biases = biases;
    }

    const message = configScoringUpdate(() => configPath, updateOptions);
    const updatedConfig = loadConfig(configPath);
    Object.assign(context.config, updatedConfig);

    return formatResult({
      scope,
      configPath,
      updates: updateOptions,
      warnings: warnings.length > 0 ? warnings : undefined,
      message,
    });
  }

  if (scope === 'plan') {
    const scopedTargetId = targetId as string;
    const planDir = findPlanDirectory(context.config.plansPath, scopedTargetId);
    if (!planDir) {
      return formatResult({ error: `Plan not found: ${scopedTargetId}` }, true);
    }
    const planFilePath = getPlanFilePath(planDir);
    if (!planFilePath) {
      return formatResult({ error: 'Plan file not found for scoped update.' }, true);
    }

    const planFolder = planDir.split('/').pop() || scopedTargetId;
    const biasResult = resolveScopedBias(biases, planFolder);
    if (biasResult.error) {
      return formatResult({ error: biasResult.error }, true);
    }
    if (biasResult.warnings.length > 0) {
      warnings.push(...biasResult.warnings);
    }

    const content = readFileSync(planFilePath, 'utf-8');
    const parsed = frontmatterHandler.parse(content);
    const existingScoring =
      parsed.frontmatter.scoring &&
      typeof parsed.frontmatter.scoring === 'object' &&
      !Array.isArray(parsed.frontmatter.scoring)
        ? (parsed.frontmatter.scoring as Record<string, unknown>)
        : {};
    const nextScoring: Record<string, unknown> = { ...existingScoring };

    if (weights && hasWeightUpdates(weights)) {
      const existingWeights =
        existingScoring.weights && typeof existingScoring.weights === 'object'
          ? (existingScoring.weights as Partial<ScoringWeights>)
          : {};
      nextScoring.weights = { ...existingWeights, ...weights };
    }
    if (biasResult.bias !== undefined) {
      nextScoring.bias = biasResult.bias;
    }

    const updatedFrontmatter = { ...parsed.frontmatter, scoring: nextScoring };
    const validation = frontmatterHandler.validate(updatedFrontmatter);
    if (!validation.isValid) {
      return formatResult({ error: validation.errors.join(', ') }, true);
    }

    const updatedContent = frontmatterHandler.stringify(updatedFrontmatter, parsed.content);
    writeFileSync(planFilePath, updatedContent, 'utf-8');

    return formatResult({
      scope,
      targetId,
      planFilePath,
      updates: {
        weights: weights && hasWeightUpdates(weights) ? weights : undefined,
        bias: biasResult.bias,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      message: `Updated scoring overrides for plan ${scopedTargetId}.`,
    });
  }

  const scopedTargetId = targetId as string;
  const agentPath = findAgentFilePath(context.config.plansPath, scopedTargetId);
  if (!agentPath) {
    return formatResult({ error: `Agent not found: ${scopedTargetId}` }, true);
  }

  const biasResult = resolveScopedBias(biases, scopedTargetId);
  if (biasResult.error) {
    return formatResult({ error: biasResult.error }, true);
  }
  if (biasResult.warnings.length > 0) {
    warnings.push(...biasResult.warnings);
  }

  const agent = readAgentFile(agentPath);
  if (!agent) {
    return formatResult({ error: `Failed to read agent: ${scopedTargetId}` }, true);
  }

  const existingScoring = agent.frontmatter.scoring ?? {};
  const nextScoring = {
    ...existingScoring,
  } as NonNullable<typeof agent.frontmatter.scoring>;

  if (weights && hasWeightUpdates(weights)) {
    nextScoring.weights = { ...(existingScoring.weights ?? {}), ...weights };
  }
  if (biasResult.bias !== undefined) {
    nextScoring.bias = biasResult.bias;
  }

  const updated = updateAgentFrontmatter(agentPath, { scoring: nextScoring });
  if (!updated) {
    return formatResult({ error: `Failed to update agent: ${targetId}` }, true);
  }

  return formatResult({
    scope,
    targetId: scopedTargetId,
    agentPath,
    updates: {
      weights: weights && hasWeightUpdates(weights) ? weights : undefined,
      bias: biasResult.bias,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
    message: `Updated scoring overrides for agent ${scopedTargetId}.`,
  });
}
