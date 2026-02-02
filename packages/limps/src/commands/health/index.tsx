import { Text } from 'ink';
import { buildHelpOutput, getProjectLlmHints, getProjectTipLine } from '../../utils/cli-help.js';

export const description = 'Health checks for plans and agents';

export default function HealthCommand(): React.ReactNode {
  const help = buildHelpOutput({
    usage: 'limps health <command>',
    sections: [
      {
        title: 'Commands',
        lines: ['staleness Check for stale plans and agents'],
      },
      {
        title: 'Help',
        lines: ['Run `limps health <command> --help` for more information.'],
      },
    ],
    tips: [getProjectTipLine()],
    llmHints: getProjectLlmHints(),
  });

  return <Text>{help.text}</Text>;
}
