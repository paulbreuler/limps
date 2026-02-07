import React from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { loadConfig } from '../../config.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';
import { buildHelpOutput } from '../../utils/cli-help.js';
import { applyProposal } from '../../cli/proposals.js';

export const description = 'Apply a single proposal by id (creates backup)';

export const args = z.tuple([
  z.string().describe('Proposal id from get_proposals / limps proposals'),
]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  confirm: z.boolean().optional().describe('Must be true to apply'),
  plan: z.string().optional().describe('Plan id to scope proposal lookup'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function ProposalsApplyCommand({ args, options }: Props): React.ReactNode {
  const [proposalId] = args;
  const configPath = resolveConfigPath(options.config);
  const config = loadConfig(configPath);

  const help = buildHelpOutput({
    usage: 'limps proposals apply <proposal-id> [options]',
    arguments: ['proposal-id Proposal id from limps proposals'],
    options: [
      '--config Path to config file',
      '--confirm Must be true to apply',
      '--plan Plan id to scope lookup',
    ],
    sections: [
      {
        title: 'Examples',
        lines: [
          'limps proposals apply proposal_0033_abc123 --confirm',
          'limps proposals apply proposal_0033_abc123 --confirm --plan 0033',
        ],
      },
    ],
  });

  if (!proposalId) {
    return <Text>{help.text}</Text>;
  }

  const confirm = options.confirm === true;
  if (!confirm) {
    return (
      <Text color="yellow">
        Refusing to apply without --confirm. Run: limps proposals apply {proposalId} --confirm
      </Text>
    );
  }

  try {
    const result = applyProposal(config, proposalId, true, options.plan);

    if (result.error) {
      return <Text color="red">{result.error}</Text>;
    }

    return (
      <Text>
        Applied proposal {proposalId}. Path: {result.path}. Backup: {result.backup}
      </Text>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return <Text color="red">{message}</Text>;
  }
}
