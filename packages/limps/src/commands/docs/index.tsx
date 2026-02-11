import { Text } from 'ink';
import { buildHelpOutput } from '../../utils/cli-help.js';

export const description = 'Document workflows (create/search/update/process)';

export default function DocsCommand(): React.ReactNode {
  const help = buildHelpOutput({
    usage: 'limps docs <command>',
    sections: [
      {
        title: 'Commands',
        lines: [
          'list [path]                List files/directories',
          'search <query>             Full-text search documents',
          'create <path>              Create a document',
          'update <path>              Update a document',
          'delete <path>              Delete a document',
          'process [path]             Run JavaScript processing against docs',
          'tags <command>             Manage tags (list/add/remove)',
          'reindex                    Rebuild the search index',
        ],
      },
      {
        title: 'Examples',
        lines: [
          'limps docs list plans',
          'limps docs search "retry policy"',
          'limps docs process plans/0004/plan.md --code "doc.content"',
          'limps docs tags add plans/0004/plan.md --tags reviewed',
        ],
      },
      {
        title: 'Help',
        lines: ['Run `limps docs <command> --help` for options and examples.'],
      },
    ],
  });

  return <Text>{help.text}</Text>;
}
