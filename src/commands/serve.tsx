import { Text } from 'ink';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import { startMcpServer } from '../server-main.js';

export const description = 'Start the MCP server';

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function ServeCommand({ options }: Props): React.ReactNode {
  const [status, setStatus] = useState<'starting' | 'running' | 'error'>('starting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startMcpServer(options.config)
      .then(() => {
        setStatus('running');
      })
      .catch((err: Error) => {
        setStatus('error');
        setError(err.message);
      });
  }, [options.config]);

  if (status === 'error') {
    return <Text color="red">Server error: {error}</Text>;
  }

  if (status === 'starting') {
    return <Text>Starting MCP server...</Text>;
  }

  return <Text color="green">MCP server running</Text>;
}
