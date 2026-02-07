import { Text } from 'ink';
import { buildHelpOutput } from '../../utils/cli-help.js';

export const description = 'Manage project configuration';

export default function ConfigCommand(): React.ReactNode {
  const help = buildHelpOutput({
    usage: 'limps config <command>',
    sections: [
      {
        title: 'Commands',
        lines: [
          'show Display resolved configuration values',
          'scoring Show or update scoring configuration',
          'path Print the resolved config file path',
          'sync-mcp [--client <claude|cursor|claude-code|codex|chatgpt|opencode|all>] [--global] [--path <path>] [--print] [-f] Add/update limps in MCP configs',
          'update [--plans-path <path>] [--docs-path <path>] Update project paths',
          'upgrade Upgrade config schema to latest version',
        ],
      },
      {
        title: 'Help',
        lines: ['Run `limps config <command> --help` for more information.'],
      },
    ],
  });

  return <Text>{help.text}</Text>;
}
