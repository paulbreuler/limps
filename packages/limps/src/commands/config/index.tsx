import { Text } from 'ink';
import { buildHelpOutput, getProjectLlmHints, getProjectTipLine } from '../../utils/cli-help.js';

export const description = 'Manage project configuration';

export default function ConfigCommand(): React.ReactNode {
  const help = buildHelpOutput({
    usage: 'limps config <command>',
    sections: [
      {
        title: 'Commands',
        lines: [
          'list Show all registered projects',
          'use <name> Set the current/default project',
          'show Display resolved configuration values',
          'scoring Show or update scoring configuration',
          'path Print the resolved config file path',
          'add <name> <path> Register an existing config file',
          'sync-mcp [project] [--projects <names>] [--client <claude|cursor|claude-code|codex|chatgpt|all>] [--global] [--path <path>] [--print] [-f] Add/update limps in MCP configs (default: local project config)',
          'update <name> [--plans-path <path>] [--docs-path <path>] Update project paths',
          'remove <name> Remove a project and delete config/dir (when under limps/projects)',
          'set <path> Set current from config path (auto-registers)',
          'discover Find configs in default locations (use `limps config use <name>` to register)',
          'migrate Pull known configs into limps/projects/ from old locations',
          'upgrade Upgrade config schema to latest version',
        ],
      },
      {
        title: 'Help',
        lines: ['Run `limps config <command> --help` for more information.'],
      },
    ],
    tips: [getProjectTipLine()],
    llmHints: getProjectLlmHints(),
  });

  return <Text>{help.text}</Text>;
}
