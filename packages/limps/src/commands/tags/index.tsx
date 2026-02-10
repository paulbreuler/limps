import { Text } from 'ink';
import { buildHelpOutput } from '../../utils/cli-help.js';

export const description = 'Manage document tags';

export default function TagsCommand(): React.ReactNode {
  const help = buildHelpOutput({
    usage: 'limps tags <command>',
    sections: [
      {
        title: 'Commands',
        lines: [
          'list <path>         List tags in a document',
          'add <path>          Add tags to a document (use --tags)',
          'remove <path>       Remove tags from a document (use --tags)',
        ],
      },
      {
        title: 'Examples',
        lines: [
          'limps tags list plans/0001-feature/000-agent.md',
          'limps tags add plans/0001-feature/000-agent.md --tags reviewed urgent',
          'limps tags remove plans/0001-feature/000-agent.md --tags urgent',
        ],
      },
      {
        title: 'Help',
        lines: ['Run `limps tags <command> --help` for more information.'],
      },
    ],
  });

  return <Text>{help.text}</Text>;
}
