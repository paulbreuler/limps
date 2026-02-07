import React from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { loadConfig } from '../../config.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';
import { buildHelpOutput } from '../../utils/cli-help.js';
import { getProposals, applyProposal } from '../../cli/proposals.js';

export const description = 'Apply all auto-applyable proposals (creates backups)';

export const args = z.tuple([z.string().describe('plan id or name').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  confirm: z.boolean().optional().describe('Must be true to apply'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function ProposalsApplySafeCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;
  const configPath = resolveConfigPath(options.config);
  const config = loadConfig(configPath);

  const help = buildHelpOutput({
    usage: 'limps proposals apply-safe [plan] [options]',
    arguments: ['plan Plan ID or name (optional)'],
    options: ['--config Path to config file', '--confirm Must be true to apply'],
    sections: [
      {
        title: 'Examples',
        lines: [
          'limps proposals apply-safe --confirm',
          'limps proposals apply-safe 0033 --confirm',
        ],
      },
    ],
  });

  const confirm = options.confirm === true;
  if (!confirm) {
    return <Text>{help.text}</Text>;
  }

  try {
    const { proposals, error } = getProposals(config, {
      planId: planId ?? undefined,
      autoApplyableOnly: true,
    });

    if (error) {
      return <Text color="red">{error}</Text>;
    }

    const allowedTypes = config.health?.proposals?.autoApply ?? [];
    const toApply =
      allowedTypes.length > 0 ? proposals.filter((p) => allowedTypes.includes(p.type)) : proposals;

    if (toApply.length === 0) {
      return (
        <Text>
          No auto-applyable proposals found
          {allowedTypes.length > 0 ? ` for configured types: ${allowedTypes.join(', ')}` : ''}.
        </Text>
      );
    }

    const results: string[] = [];
    for (const p of toApply) {
      const result = applyProposal(config, p.id, true, p.planId);
      if (result.applied) {
        results.push(`Applied ${p.id} → ${result.path}`);
      } else {
        results.push(`Failed ${p.id}: ${result.error ?? 'unknown'}`);
      }
    }

    return <Text>{results.join('\n')}</Text>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return <Text color="red">{message}</Text>;
  }
}
