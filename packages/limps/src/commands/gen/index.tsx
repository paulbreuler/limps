import React from 'react';
import { Text } from 'ink';

export const description = 'Generate planning artifacts (persona, journey, spec, agent)';

export default function GenHelp(): React.JSX.Element {
  return (
    <Text>
      Usage: limps gen {'<subcommand>'}
      {'\n'}
      {'\n'}
      Subcommands:{'\n'}
      {'  '}pe, persona {'<name>'}
      {'     '}Create a persona document{'\n'}
      {'  '}jn, journey {'<name>'}
      {'     '}Create a user journey{'\n'}
      {'  '}sp, spec {'<plan>'}
      {'        '}Generate spec for a plan{'\n'}
      {'  '}ag, agent {'<plan> <title>'}
      {'  '}Create an agent task{'\n'}
      {'  '}ags, agents {'<plan>'}
      {'     '}Bulk-create agents from spec{'\n'}
      {'  '}pr, primer {'<plan>'}
      {'      '}Create/update plan primer{'\n'}
    </Text>
  );
}
