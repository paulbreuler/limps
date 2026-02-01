import { Text } from 'ink';
import { z } from 'zod';
import {
  configScoringShow,
  configScoringUpdate,
  type ScoringConfigUpdateOptions,
} from '../../cli/config-cmd.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';
import type { ScoringBiases, ScoringWeights } from '../../config.js';

export const description = 'Show or update scoring configuration';

export const options = z.object({
  preset: z.string().optional().describe('Preset name'),
  weight: z.string().optional().describe('Weight overrides: dependency=50,priority=20,workload=30'),
  bias: z
    .string()
    .optional()
    .describe(
      'Bias overrides: plan:0027=10,persona:reviewer=-10,status:BLOCKED=20 (comma-separated)'
    ),
});

interface Props {
  options: z.infer<typeof options>;
}

const parseWeights = (input: string): Partial<ScoringWeights> => {
  const weights: Partial<ScoringWeights> = {};
  const entries = input
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of entries) {
    const [rawKey, rawValue] = entry.split('=');
    if (!rawKey || rawValue === undefined) {
      throw new Error(`Invalid weight format "${entry}". Use key=value pairs.`);
    }
    const key = rawKey.trim();
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid weight value for "${key}": ${rawValue}`);
    }
    if (key !== 'dependency' && key !== 'priority' && key !== 'workload') {
      throw new Error(`Unknown weight "${key}". Valid keys: dependency, priority, workload.`);
    }
    weights[key] = value;
  }
  return weights;
};

const parseBiases = (input: string): Partial<ScoringBiases> => {
  const biases: Partial<ScoringBiases> = {};
  const entries = input
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of entries) {
    const [rawKey, rawValue] = entry.split('=');
    if (!rawKey || rawValue === undefined) {
      throw new Error(`Invalid bias format "${entry}". Use type:name=value.`);
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid bias value for "${rawKey}": ${rawValue}`);
    }
    const [rawType, rawName] = rawKey.split(':');
    if (!rawType || !rawName) {
      throw new Error(`Invalid bias key "${rawKey}". Use type:name.`);
    }
    const type = rawType.trim();
    const name = rawName.trim();
    if (type === 'plan') {
      biases.plans = { ...(biases.plans ?? {}), [name]: value };
      continue;
    }
    if (type === 'persona') {
      if (!['coder', 'reviewer', 'pm', 'customer'].includes(name)) {
        throw new Error(`Unknown persona "${name}".`);
      }
      biases.personas = { ...(biases.personas ?? {}), [name]: value };
      continue;
    }
    if (type === 'status') {
      if (!['GAP', 'WIP', 'BLOCKED'].includes(name)) {
        throw new Error(`Unknown status "${name}".`);
      }
      biases.statuses = { ...(biases.statuses ?? {}), [name]: value };
      continue;
    }
    throw new Error(`Unknown bias type "${type}". Use plan, persona, or status.`);
  }
  return biases;
};

export default function ConfigScoringCommand({ options }: Props): React.ReactNode {
  if (!options.preset && !options.weight && !options.bias) {
    const output = configScoringShow(() => resolveConfigPath());
    return <Text>{output}</Text>;
  }

  try {
    const updateOptions: ScoringConfigUpdateOptions = {};
    if (options.preset) {
      updateOptions.preset = options.preset as ScoringConfigUpdateOptions['preset'];
    }
    if (options.weight) {
      updateOptions.weights = parseWeights(options.weight);
    }
    if (options.bias) {
      updateOptions.biases = parseBiases(options.bias);
    }

    const output = configScoringUpdate(() => resolveConfigPath(), updateOptions);
    return <Text color="green">{output}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
