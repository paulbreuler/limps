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
      <Text color="yellow">Usage:</Text> limps {'<command>'} [options]{'\n'}
      {'\n'}
      <Text color="cyan">HTTP Server:</Text>
      {'\n'}
      {'  '}start{'          '}Start the HTTP MCP server{'\n'}
      {'  '}stop{'           '}Stop the HTTP server{'\n'}
      {'  '}status-server{'  '}Show server status{'\n'}
      {'\n'}
      <Text color="cyan">Plan Management:</Text>
      {'\n'}
      {'  '}init {'<name>   '}Initialize a new project{'\n'}
      {'  '}list-plans{'    '}List all plans with status{'\n'}
      {'  '}list-agents{'   '}List agents in a plan{'\n'}
      {'  '}next-task{'     '}Get the next best task{'\n'}
      {'  '}score-task{'    '}Show scoring for a task{'\n'}
      {'  '}score-all{'     '}Compare scores across tasks{'\n'}
      {'  '}status{'        '}Show plan progress{'\n'}
      {'  '}repair-plans{'  '}Repair plan frontmatter{'\n'}
      {'  '}health{'        '}Run plan health checks{'\n'}
      {'  '}proposals{'     '}List and apply update proposals{'\n'}
      {'\n'}
      <Text color="cyan">System:</Text>
      {'\n'}
      {'  '}reindex{'       '}Rebuild the document index{'\n'}
      {'  '}config{'        '}Manage project configuration{'\n'}
      {'  '}graph{'         '}Knowledge graph commands{'\n'}
      {'  '}version{'       '}Show version information{'\n'}
      {'\n'}
      Run <Text color="green">limps {'<command>'}</Text> without args for usage help.{'\n'}
      Run <Text color="green">limps {'<command>'} --help</Text> for full documentation.
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
