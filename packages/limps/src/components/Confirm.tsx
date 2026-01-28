/**
 * Interactive confirmation component using Ink.
 * Displays a prompt and waits for user input (y/n).
 */

import { Box, Text } from 'ink';
import { useInput } from 'ink';
import { useState } from 'react';

interface ConfirmProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  defaultYes?: boolean;
}

export function Confirm({
  message,
  onConfirm,
  onCancel,
  defaultYes = false,
}: ConfirmProps): React.ReactNode {
  const [confirmed, setConfirmed] = useState<boolean | null>(null);

  useInput((input, key) => {
    // Don't process input if already confirmed/cancelled
    if (confirmed !== null) {
      return;
    }

    if (key.return) {
      // Enter key - use default
      const result = defaultYes;
      setConfirmed(result);
      if (result) {
        onConfirm();
      } else {
        onCancel();
      }
      return;
    }

    // Handle y/Y for yes
    if (input.toLowerCase() === 'y') {
      setConfirmed(true);
      onConfirm();
      return;
    }

    // Handle n/N or Escape for no
    if (input.toLowerCase() === 'n' || key.escape) {
      setConfirmed(false);
      onCancel();
      return;
    }
  });

  const defaultText = defaultYes ? 'Y/n' : 'y/N';

  return (
    <Box flexDirection="column" marginY={1}>
      <Box marginBottom={1}>
        <Text color="yellow" bold>
          ⚠️ {message}
        </Text>
      </Box>
      <Box>
        <Text>
          Continue? (<Text color="cyan">{defaultText}</Text>)
        </Text>
      </Box>
      {confirmed !== null && (
        <Box marginTop={1}>
          <Text color={confirmed ? 'green' : 'red'}>
            {confirmed ? '✓ Confirmed' : '✗ Cancelled'}
          </Text>
        </Box>
      )}
    </Box>
  );
}
