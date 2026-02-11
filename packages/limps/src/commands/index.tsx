import { Box, Text } from 'ink';
import { useState, useEffect } from 'react';
import { getPackageVersion } from '../utils/version.js';
import { shouldShowWhatsNew } from '../utils/version-state.js';
import { WhatsNew } from '../components/WhatsNew.js';

export const description = 'Local Intelligent MCP Planning Server';

export default function DefaultCommand(): React.ReactNode {
  const version = getPackageVersion();
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  useEffect(() => {
    // Check if we should show What's New on mount
    if (shouldShowWhatsNew(version)) {
      setShowWhatsNew(true);
    }
  }, [version]);

  const defaultContent = (
    <Text>
      <Text color="cyan" bold>
        limps
      </Text>{' '}
      <Text color="yellow">v{version}</Text> - Local Intelligent MCP Planning Server{'\n'}
      {'\n'}
      <Text color="yellow">Usage:</Text> limps {'<group|command>'} [options]{'\n'}
      {'\n'}
      <Text color="cyan">Recommended Groups:</Text>
      {'\n'}
      {'  '}server{'         '}Daemon lifecycle (start/stop/status/bridge){'\n'}
      {'  '}plan{'           '}Plan and task workflows{'\n'}
      {'  '}docs{'           '}Document CRUD/search/process/tags{'\n'}
      {'  '}config{'         '}Project configuration{'\n'}
      {'  '}health{'         '}Health checks and inference{'\n'}
      {'  '}graph{'          '}Knowledge graph operations{'\n'}
      {'  '}proposals{'      '}Review and apply suggested fixes{'\n'}
      {'\n'}
      <Text color="cyan">Common Commands:</Text>
      {'\n'}
      {'  '}init {'<name>   '}Initialize a new project{'\n'}
      {'  '}plan list{'      '}List plans with status{'\n'}
      {'  '}plan agents 4{'  '}List agents in plan 4{'\n'}
      {'  '}plan score --plan 4 --agent 3{'  '}Score a specific task{'\n'}
      {'  '}plan scores --plan 4{'  '}Compare all available task scores{'\n'}
      {'  '}docs search "query"{'  '}Search indexed documents{'\n'}
      {'  '}completion zsh Enable shell tab completion{'\n'}
      {'\n'}
      <Text color="cyan">Other:</Text>
      {'\n'}
      {'  '}version{'       '}Show version information{'\n'}
      {'\n'}
      Run <Text color="green">limps {'<group|command>'}</Text> without args for guided help.{'\n'}
      Run <Text color="green">limps {'<group|command>'} --help</Text> for full documentation.
    </Text>
  );

  if (showWhatsNew) {
    return (
      <Box flexDirection="column">
        <WhatsNew version={version} onDismiss={() => setShowWhatsNew(false)} />
        {defaultContent}
      </Box>
    );
  }

  return defaultContent;
}
