/**
 * What's New component for displaying changelog information after updates.
 */

import { Box, Text } from 'ink';
import { useEffect } from 'react';
import { getChangelogForVersion, formatChangelogForDisplay } from '../utils/changelog.js';
import { updateLastSeenVersion } from '../utils/version-state.js';
import { textColors } from '../theme/colors.js';

interface WhatsNewProps {
  version: string;
  onDismiss?: () => void;
}

export function WhatsNew({ version, onDismiss }: WhatsNewProps): React.ReactNode {
  const changelog = getChangelogForVersion(version);
  const formattedChangelog = changelog ? formatChangelogForDisplay(changelog) : null;

  // Mark version as seen after component mounts
  useEffect(() => {
    updateLastSeenVersion(version);
    if (onDismiss) {
      // Small delay to ensure the component has rendered
      const timer = setTimeout(() => {
        onDismiss();
      }, 100);
      return (): void => {
        clearTimeout(timer);
      };
    }
    return undefined;
  }, [version, onDismiss]);

  if (!formattedChangelog) {
    // If no changelog found, show a simple message
    return (
      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
        paddingY={1}
        marginBottom={1}
        flexDirection="column"
      >
        <Box marginBottom={1}>
          <Text color="cyan" bold>
            What's New in v{version}
          </Text>
        </Box>
        <Text>Version {version} is now available.</Text>
      </Box>
    );
  }

  // Split changelog into lines for better formatting
  const lines = formattedChangelog.split('\n');

  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={1}
      marginBottom={1}
      flexDirection="column"
    >
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          What's New in v{version}
        </Text>
      </Box>
      <Box flexDirection="column">
        {lines.map((line, index) => {
          // Style headers (### sections) differently
          if (line.startsWith('### ')) {
            return (
              <Text key={index} color="yellow" bold>
                {line}
              </Text>
            );
          }
          // Style list items
          if (line.trim().startsWith('* ')) {
            return (
              <Text key={index} color={textColors.primary}>
                {line}
              </Text>
            );
          }
          // Regular text
          if (line.trim() === '') {
            return <Text key={index}>{'\n'}</Text>;
          }
          return (
            <Text key={index} color={textColors.primary}>
              {line}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
