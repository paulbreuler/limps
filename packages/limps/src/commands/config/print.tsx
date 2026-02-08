import { Text } from 'ink';
import { z } from 'zod';
import { getSyncClients, type McpSyncClient } from '../../cli/mcp-clients.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';

export const description = 'Print MCP client config snippets for limps';

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  client: z
    .enum(['claude', 'cursor', 'claude-code', 'codex', 'chatgpt', 'opencode', 'all'])
    .optional()
    .default('all')
    .describe(
      'MCP client to configure (claude, cursor, claude-code, codex, chatgpt, opencode, or all). Default: all'
    ),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function ConfigSyncMcpCommand({ options }: Props): React.ReactNode {
  // Resolve config path
  let configPath: string;
  try {
    configPath = resolveConfigPath(options.config);
  } catch (err) {
    return <Text color="red">Error: {(err as Error).message}</Text>;
  }

  // Get all available clients
  const allClients = getSyncClients();
  const selectedClients: McpSyncClient[] =
    options.client === 'all'
      ? allClients
      : allClients.filter((client) => client.id === options.client);

  // Print config snippets for each selected client
  try {
    const printResults: string[] = [];

    for (const client of selectedClients) {
      if (!client.runPrint) {
        printResults.push(`${client.displayName}: Error - print not supported.`);
        continue;
      }
      try {
        const output = client.runPrint(configPath);
        printResults.push(output);
      } catch (err) {
        printResults.push(`${client.displayName}: Error - ${(err as Error).message}`);
      }
    }

    return <Text>{printResults.join('\n\n')}</Text>;
  } catch (err) {
    return <Text color="red">Error: {(err as Error).message}</Text>;
  }
}
