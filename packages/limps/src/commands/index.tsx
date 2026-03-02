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
      <Text color="cyan">Groups:</Text>
      {'\n'}
      {'  '}gn, gen{'        '}Generate planning artifacts (persona, journey, spec, agent){'\n'}
      {'  '}pl, plan{'       '}Plan and task workflows{'\n'}
      {'  '}dc, docs{'       '}Document CRUD/search/process/tags{'\n'}
      {'  '}gr, graph{'      '}Knowledge graph operations{'\n'}
      {'  '}hl, health{'     '}Health checks and inference{'\n'}
      {'  '}sv, server{'     '}Daemon lifecycle (start/stop/status/bridge){'\n'}
      {'  '}cf, config{'     '}Project configuration{'\n'}
      {'  '}pr, proposals{'  '}Review and apply suggested fixes{'\n'}
      {'\n'}
      <Text color="cyan">Commands:</Text>
      {'\n'}
      {'  '}init {'<name>   '}Initialize a new project{'\n'}
      {'  '}completion{'    '}Enable shell tab completion{'\n'}
      {'  '}version{'       '}Show version information{'\n'}
      {'\n'}
      <Text color="cyan">Examples:</Text>
      {'\n'}
      {'  '}limps pl list{'           '}List plans with status{'\n'}
      {'  '}limps pl agents 4{'      '}List agents in plan 4{'\n'}
      {'  '}limps dc search "query"{'  '}Search indexed documents{'\n'}
      {'\n'}
      Run <Text color="green">limps {'<group>'}</Text> without args for guided help.{'\n'}
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
