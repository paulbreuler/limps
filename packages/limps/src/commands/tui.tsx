import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import { z } from 'zod';

export const description = 'Launch TUI mission control dashboard';
export const options = z.object({
  acpPort: z.number().optional().describe('ACP Hub port (default: 7379)'),
  config: z.string().optional().describe('Path to limps config file'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function TuiCommand({ options: opts }: Props): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    import('../tui/index.js')
      .then(({ startTui }) => startTui({ acpPort: opts.acpPort, configPath: opts.config }))
      .catch((err: Error) => setError(err.message));
  }, [opts.acpPort, opts.config]);

  if (error) {
    return <Text color="red">TUI Error: {error}</Text>;
  }

  return <Text dimColor>Starting TUI...</Text>;
}
