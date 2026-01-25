import { Text } from 'ink';

export const description = 'Local Iterative Multi-agent Planning Server';

export default function DefaultCommand(): React.ReactNode {
  return (
    <Text>
      limps - Local Iterative Multi-agent Planning Server{'\n'}
      {'\n'}
      Usage: limps {'<command>'} [options]{'\n'}
      {'\n'}
      Commands:{'\n'}
      {'  '}serve Start the MCP server{'\n'}
      {'  '}init {'<name>'} Initialize a new project{'\n'}
      {'  '}list-plans List all plans{'\n'}
      {'  '}list-agents {'<plan>'} List agents in a plan{'\n'}
      {'  '}next-task {'<plan>'} Get the next best task{'\n'}
      {'  '}status {'<plan>'} Show plan status{'\n'}
      {'  '}config Manage project configuration{'\n'}
      {'\n'}
      Run `limps {'<command>'} --help` for more information.
    </Text>
  );
}
