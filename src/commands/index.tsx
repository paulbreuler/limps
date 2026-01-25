import { Text } from 'ink';

export const description = 'Local Intelligent MCP Planning Server';

export default function DefaultCommand(): React.ReactNode {
  return (
    <Text>
      <Text color="cyan" bold>
        limps
      </Text>{' '}
      - Local Intelligent MCP Planning Server{'\n'}
      {'\n'}
      <Text color="yellow">Usage:</Text> limps {'<command>'} [options]{'\n'}
      {'\n'}
      <Text color="cyan">Commands:</Text>
      {'\n'}
      {'  '}serve{'         '}Start the MCP server{'\n'}
      {'  '}init {'<name>   '}Initialize a new project{'\n'}
      {'  '}list-plans{'    '}List all plans with status{'\n'}
      {'  '}list-agents{'   '}List agents in a plan{'\n'}
      {'  '}next-task{'     '}Get the next best task{'\n'}
      {'  '}status{'        '}Show plan progress{'\n'}
      {'  '}config{'        '}Manage project configuration{'\n'}
      {'\n'}
      Run <Text color="green">limps {'<command>'}</Text> without args for usage help.{'\n'}
      Run <Text color="green">limps {'<command>'} --help</Text> for full documentation.
    </Text>
  );
}
