import { Text } from 'ink';
import { buildHelpOutput } from '../../utils/cli-help.js';

export const description = 'Knowledge graph commands';

export default function GraphCommand(): React.ReactNode {
  const help = buildHelpOutput({
    usage: 'limps graph <command>',
    sections: [
      {
        title: 'Commands',
        lines: [
          'reindex    Rebuild the knowledge graph from plan files',
          'health     Show graph statistics and conflict summary',
          'search     Search entities in the knowledge graph',
          'trace      Trace entity relationships',
          'entity     Show details for a specific entity',
          'overlap    Find overlapping features',
          'check      Run conflict detection checks',
          'suggest    Get graph-based suggestions',
          'watch      Watch for changes and update graph',
        ],
      },
      {
        title: 'Help',
        lines: ['Run `limps graph <command> --help` for more information.'],
      },
    ],
  });

  return <Text>{help.text}</Text>;
}
