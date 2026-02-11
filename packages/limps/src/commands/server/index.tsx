import { Text } from 'ink';
import { buildHelpOutput } from '../../utils/cli-help.js';

export const description = 'HTTP daemon lifecycle commands';

export default function ServerCommand(): React.ReactNode {
  const help = buildHelpOutput({
    usage: 'limps server <command>',
    sections: [
      {
        title: 'Commands',
        lines: [
          'start                      Start the limps daemon',
          'stop                       Stop the limps daemon',
          'status                     Show daemon status',
          'bridge                     Run stdio-to-HTTP bridge for MCP clients',
        ],
      },
      {
        title: 'Examples',
        lines: [
          'limps server start',
          'limps server status',
          'limps server stop',
          'limps server bridge',
        ],
      },
      {
        title: 'Help',
        lines: ['Run `limps server <command> --help` for details.'],
      },
    ],
  });

  return <Text>{help.text}</Text>;
}
