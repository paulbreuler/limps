import { z } from 'zod';
import { useEffect } from 'react';
import { startMcpServer } from '../server-main.js';

export const description = 'Start the MCP server';

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
});

interface Props {
  options: z.infer<typeof options>;
}

/**
 * MCP Server command.
 * IMPORTANT: This command must NOT render anything to stdout.
 * MCP servers use stdio transport and stdout must only contain JSON-RPC messages.
 * All status/error messages go to stderr via console.error().
 */
export default function ServeCommand({ options }: Props): React.ReactNode {
  useEffect(() => {
    // All output goes to stderr, not stdout
    console.error('MCP Planning Server running on stdio');

    startMcpServer(options.config).catch((err: Error) => {
      console.error(`Server error: ${err.message}`);
      process.exit(1);
    });
  }, [options.config]);

  // Return null - no stdout output allowed for MCP servers
  return null;
}
