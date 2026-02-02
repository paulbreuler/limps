import React, { useEffect } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { loadConfig } from '../../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../../utils/config-resolver.js';
import { buildHelpOutput, getProjectLlmHints, getProjectTipLine } from '../../utils/cli-help.js';
import { inferStatus } from '../../cli/health-inference.js';
import { handleJsonOutput, isJsonMode } from '../../cli/json-output.js';

export const description = 'Suggest status updates for plan agents (inference)';

export const args = z.tuple([z.string().describe('plan id or name').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  project: z.string().optional().describe('Registered project name'),
  json: z.boolean().optional().describe('Output as JSON'),
  agent: z.string().optional().describe('Specific agent number to infer (e.g., 000)'),
  minConfidence: z.number().optional().describe('Minimum confidence 0–1 to include suggestions'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function HealthInferenceCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;
  const configPath = options.project
    ? resolveProjectConfigPath(options.project)
    : resolveConfigPath(options.config);
  const config = loadConfig(configPath);
  const jsonMode = isJsonMode(options);

  const help = buildHelpOutput({
    usage: 'limps health inference [plan] [options]',
    arguments: ['plan Plan ID or name (optional)'],
    options: [
      '--config Path to config file',
      '--project Registered project name',
      '--json Output as JSON',
      '--agent Specific agent number',
      '--min-confidence Minimum confidence 0–1',
    ],
    sections: [
      {
        title: 'Examples',
        lines: [
          'limps health inference',
          'limps health inference 0033',
          'limps health inference 0033 --agent 000',
          'limps health inference --json',
        ],
      },
    ],
    tips: [getProjectTipLine()],
    llmHints: getProjectLlmHints(),
  });

  useEffect((): (() => void) | undefined => {
    if (!jsonMode || !planId) {
      return;
    }
    const timer = setTimeout(() => {
      try {
        handleJsonOutput(() => {
          const result = inferStatus(config, planId, {
            agentNumber: options.agent,
            minConfidence: options.minConfidence,
          });
          if (result.error) {
            throw new Error(result.error);
          }
          return result;
        }, 'INFERENCE_ERROR');
      } catch {
        // handleJsonOutput calls process.exit
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [jsonMode, config, planId, options.agent, options.minConfidence]);

  if (jsonMode) {
    return null;
  }

  if (!planId) {
    return <Text>{help.text}</Text>;
  }

  try {
    const result = inferStatus(config, planId, {
      agentNumber: options.agent,
      minConfidence: options.minConfidence,
    });

    if (result.error) {
      return <Text color="red">{result.error}</Text>;
    }

    if (result.suggestions.length === 0) {
      return (
        <Text>
          No status suggestions for plan {planId} (checked {result.agentsChecked} agents).
        </Text>
      );
    }

    const lines = [
      `Plan ${planId}: ${result.suggestions.length} suggestion(s) (checked ${result.agentsChecked} agents)`,
      '',
      ...result.suggestions.map(
        (s) =>
          `  ${s.taskId}: ${s.currentStatus} → ${s.suggestedStatus} (confidence ${s.confidence})`
      ),
      '',
      ...result.suggestions.flatMap((s) => s.reasons.map((r) => `  - ${r}`)),
    ];

    return <Text>{lines.join('\n')}</Text>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return <Text color="red">{message}</Text>;
  }
}
