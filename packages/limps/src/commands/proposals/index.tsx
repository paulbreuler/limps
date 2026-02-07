import React, { useEffect } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { loadConfig } from '../../config.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';
import { buildHelpOutput } from '../../utils/cli-help.js';
import { getProposals } from '../../cli/proposals.js';
import { handleJsonOutput, isJsonMode } from '../../cli/json-output.js';

export const description = 'List update proposals from staleness, drift, and inference';

export const args = z.tuple([z.string().describe('plan id or name').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().describe('Output as JSON'),
  codebase: z.string().optional().describe('Path to codebase (for drift proposals)'),
  autoOnly: z.boolean().optional().describe('Only show auto-applyable proposals'),
  minConfidence: z.number().min(0).max(1).optional().describe('Minimum confidence 0–1'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function ProposalsListCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;
  const configPath = resolveConfigPath(options.config);
  const config = loadConfig(configPath);
  const jsonMode = isJsonMode(options);

  const help = buildHelpOutput({
    usage: 'limps proposals [plan] [options]',
    arguments: ['plan Plan ID or name (optional)'],
    options: [
      '--config Path to config file',
      '--json Output as JSON',
      '--codebase Path to codebase (for drift proposals)',
      '--auto-only Only show auto-applyable proposals',
      '--min-confidence Minimum confidence 0-1',
    ],
    sections: [
      {
        title: 'Examples',
        lines: [
          'limps proposals',
          'limps proposals 0033',
          'limps proposals 0033 --codebase ./packages/limps',
          'limps proposals --json',
        ],
      },
    ],
  });

  useEffect((): (() => void) | undefined => {
    if (!jsonMode) {
      return;
    }
    const timer = setTimeout(() => {
      try {
        handleJsonOutput(() => {
          const result = getProposals(config, {
            planId: planId ?? undefined,
            autoApplyableOnly: options.autoOnly,
            minConfidence: options.minConfidence,
            codebasePath: options.codebase,
          });
          if (result.error) {
            throw new Error(result.error);
          }
          return { proposals: result.proposals, count: result.proposals.length };
        }, 'PROPOSALS_ERROR');
      } catch {
        // handleJsonOutput calls process.exit
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [jsonMode, config, planId, options.autoOnly, options.minConfidence, options.codebase]);

  if (jsonMode) {
    return null;
  }

  try {
    const result = getProposals(config, {
      planId: planId ?? undefined,
      autoApplyableOnly: options.autoOnly,
      minConfidence: options.minConfidence,
      codebasePath: options.codebase,
    });

    if (result.error) {
      return <Text color="red">{result.error}</Text>;
    }

    if (result.proposals.length === 0) {
      return (
        <Text>
          No proposals found{planId ? ` for plan ${planId}` : ''}. Try --codebase for drift
          proposals.
        </Text>
      );
    }

    const lines = [
      `Proposals (${result.proposals.length}):`,
      '',
      ...result.proposals
        .map((p) => [
          `  ${p.id}`,
          `    type: ${p.type}  target: ${p.target}  confidence: ${p.confidence}`,
          `    reason: ${p.reason}`,
          `    ${p.currentValue} → ${p.proposedValue}${p.autoApplyable ? '  [auto-applyable]' : ''}`,
          '',
        ])
        .flat(),
    ];

    return <Text>{lines.join('\n')}</Text>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return (
      <Text>
        <Text color="red">{message}</Text>
        {'\n\n'}
        {help.text}
      </Text>
    );
  }
}
