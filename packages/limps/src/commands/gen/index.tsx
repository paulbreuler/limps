import React from 'react';
import { Text } from 'ink';
import { buildHelpOutput } from '../../utils/cli-help.js';

export const description = 'Generate planning artifacts (persona, journey, spec, agent)';

export default function GenHelp(): React.JSX.Element {
  const help = buildHelpOutput({
    usage: 'limps gen <command>',
    sections: [
      {
        title: 'Commands',
        lines: [
          'persona <name>             Create a persona document',
          'journey <name>             Create a user journey',
          'spec <plan>                Generate 12-section spec for a plan',
          'agent <plan> <title>       Create an INVEST-scoped agent task',
          'agents <plan>              Bulk-create agents from spec',
          'primer <plan>              Create or update a plan primer file',
        ],
      },
      {
        title: 'Examples',
        lines: [
          'limps gen persona "Alex Chen" --description "Platform engineer"',
          'limps gen journey "Sprint onboarding" --persona personas/alex-chen.md',
          'limps gen agent sprint-42 "Implement auth" --strict',
          'limps gen primer sprint-42',
        ],
      },
      {
        title: 'Help',
        lines: ['Run `limps gen <command> --help` for more details and options.'],
      },
    ],
  });

  return <Text>{help.text}</Text>;
}
