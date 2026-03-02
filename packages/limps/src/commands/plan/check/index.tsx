import React from 'react';
import { Text } from 'ink';

export const description = 'Run health checks on a plan';

export default function PlanCheckHelp(): React.JSX.Element {
  return (
    <Text>
      Usage: limps plan check {'<subcommand>'}
      {'\n'}
      {'\n'}
      Subcommands:{'\n'}
      {'  '}invest {'<plan>'}
      {'  '}Check INVEST compliance for all agents
    </Text>
  );
}
