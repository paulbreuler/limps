import { Text } from 'ink';

export const description = 'Manage project configuration';

export default function ConfigCommand(): React.ReactNode {
  return (
    <Text>
      Usage: limps config {'<command>'}
      {'\n'}
      {'\n'}
      Commands:{'\n'}
      {'  '}list Show all registered projects{'\n'}
      {'  '}use {'<name>'} Set the current/default project{'\n'}
      {'  '}show Display resolved configuration values{'\n'}
      {'  '}path Print the resolved config file path{'\n'}
      {'  '}add {'<name>'} {'<path>'} Register an existing config file{'\n'}
      {'  '}sync-mcp [project] [--projects {'<names>'}] [--client{' '}
      {'<claude|cursor|claude-code|all>'}] [--print] [-f] Add/update limps projects in MCP client
      configs (default: all){'\n'}
      {'  '}update {'<name>'} [--plans-path {'<path>'}] [--docs-path {'<path>'}] Update project
      paths{'\n'}
      {'  '}remove {'<name>'} Unregister a project (keeps files){'\n'}
      {'  '}set {'<path>'} Set current from config path (auto-registers){'\n'}
      {'  '}discover Find and register configs in default locations{'\n'}
      {'\n'}
      Run `limps config {'<command>'} --help` for more information.
    </Text>
  );
}
