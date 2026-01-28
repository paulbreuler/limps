import { Text, Box } from 'ink';
import { z } from 'zod';
import { useState, useEffect } from 'react';
import {
  getSyncClients,
  createLocalClient,
  getLocalClientType,
  type McpSyncClient,
} from '../../cli/mcp-clients.js';
import { Confirm } from '../../components/Confirm.js';
import { listProjects } from '../../cli/registry.js';

export const description =
  'Add or update limps projects in MCP client configs (default: local/project config)';

export const args = z.tuple([
  z.string().describe('Project name (optional, overrides --projects)').optional(),
]);

export const options = z.object({
  projects: z
    .string()
    .optional()
    .describe('Comma-separated list of project names to add (default: all registered projects)'),
  client: z
    .enum(['claude', 'cursor', 'claude-code', 'codex', 'chatgpt', 'all'])
    .optional()
    .default('all')
    .describe(
      'MCP client to configure (claude, cursor, claude-code, codex, chatgpt, or all). Default: all'
    ),
  global: z
    .boolean()
    .optional()
    .describe('Write to global/user config instead of local project config'),
  path: z
    .string()
    .optional()
    .describe('Custom path for local config file (overrides default client-specific path)'),
  print: z
    .boolean()
    .optional()
    .describe('Print config JSON instead of writing to files (for unsupported clients)'),
  force: z.boolean().optional().describe('Skip confirmation prompt (-f)'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function ConfigSyncMcpCommand({ args, options }: Props): React.ReactNode {
  // Support short flag alias "-f" in addition to "--force"
  const force = options.force || process.argv.includes('-f');
  // If force is set, skip confirmation
  const [confirmed, setConfirmed] = useState<boolean | null>(force ? true : null);
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Positional argument takes precedence over --projects option
  const [positionalProject] = args;
  const projectFilter = positionalProject
    ? [positionalProject]
    : options.projects
      ? options.projects
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p.length > 0)
      : undefined;

  // Build list of projects to show
  const allProjects = listProjects();
  const projectsToShow = projectFilter
    ? allProjects.filter((p) => projectFilter.includes(p.name))
    : allProjects;

  // Get all available global clients
  const allClients = getSyncClients();
  const selectedClients: McpSyncClient[] =
    options.client === 'all'
      ? allClients
      : allClients.filter((client) => client.id === options.client);

  // Determine if we're writing to global or local configs
  const useGlobal = options.global === true;

  // Build list of local clients to update (when not using --global)
  interface LocalClientInfo {
    clientType: ReturnType<typeof getLocalClientType>;
    client: ReturnType<typeof createLocalClient>;
  }
  const localClients: LocalClientInfo[] = [];

  if (!useGlobal) {
    // When a custom path is provided, use it for all clients that support local configs
    if (options.path) {
      // Use custom path with 'custom' client type
      const localClient = createLocalClient('custom', options.path);
      localClients.push({ clientType: 'custom', client: localClient });
    } else {
      // Create local clients for each selected client that supports local configs
      for (const client of selectedClients) {
        const localType = getLocalClientType(client.id);
        if (localType) {
          const localClient = createLocalClient(localType);
          localClients.push({ clientType: localType, client: localClient });
        }
      }
    }
  }

  // Build display names for confirmation message
  const clientsToShow: string[] = [];
  if (useGlobal) {
    clientsToShow.push(...selectedClients.map((client) => `${client.displayName} (global)`));
  } else {
    clientsToShow.push(...localClients.map((lc) => lc.client.displayName));
    // Also show print-only clients
    const printOnlyClients = selectedClients.filter((client) => client.printOnly);
    clientsToShow.push(...printOnlyClients.map((client) => client.displayName));
  }

  // Preview changes
  const diffBlocks: string[] = [];
  let hasAnyChanges = false;

  if (!force) {
    if (useGlobal) {
      // Preview global client changes
      for (const client of selectedClients) {
        if (!client.supportsPreview || !client.runPreview) {
          continue;
        }
        try {
          const preview = client.runPreview(projectFilter);
          if (preview.hasChanges) {
            hasAnyChanges = true;
            diffBlocks.push(
              `--- ${client.displayName} (${preview.configPath}) ---\n${preview.diffText}`
            );
          }
        } catch (err) {
          diffBlocks.push(`--- ${client.displayName} ---\nError: ${(err as Error).message}`);
        }
      }
    } else {
      // Preview local client changes
      for (const { client } of localClients) {
        try {
          const preview = client.runPreview(projectFilter);
          if (preview.hasChanges) {
            hasAnyChanges = true;
            diffBlocks.push(
              `--- ${client.displayName} (${preview.configPath}) ---\n${preview.diffText}`
            );
          }
        } catch (err) {
          diffBlocks.push(`--- ${client.displayName} ---\nError: ${(err as Error).message}`);
        }
      }
    }
  }

  const diffSection =
    diffBlocks.length > 0 ? `\n\nConfig diff (preview):\n${diffBlocks.join('\n\n')}` : '';
  const printOnlyClients = selectedClients.filter((client) => client.printOnly);
  const includesPrintOnly = printOnlyClients.length > 0;
  const changeNote =
    !force && !hasAnyChanges && !includesPrintOnly ? '\n\nNo config changes detected.' : '';
  const printOnlyNames = printOnlyClients.map((client) => client.displayName).join(', ');
  const printOnlyNote = includesPrintOnly
    ? `\n\nPrint-only clients (${printOnlyNames}) will not write local config files.`
    : '';

  const scopeNote = useGlobal ? ' (global configs)' : ' (local/project configs)';
  const warningMessage = `This will add/update ${projectsToShow.length} project(s) (${projectsToShow.map((p) => p.name).join(', ')}) in ${clientsToShow.join(', ')}${scopeNote}.${diffSection}${changeNote}${printOnlyNote}`;

  // If --print, just output the JSON format (no confirmation needed)
  if (options.print) {
    try {
      const printResults: string[] = [];

      if (useGlobal) {
        // Print global configs
        for (const client of selectedClients) {
          if (!client.supportsPrint || !client.runPrint) {
            printResults.push(`${client.displayName}: Error - print not supported.`);
            continue;
          }
          try {
            const output = client.runPrint(projectFilter);
            printResults.push(output);
          } catch (err) {
            printResults.push(`${client.displayName}: Error - ${(err as Error).message}`);
          }
        }
      } else {
        // Print local configs
        for (const { client } of localClients) {
          try {
            const output = client.runPrint(projectFilter);
            printResults.push(output);
          } catch (err) {
            printResults.push(`${client.displayName}: Error - ${(err as Error).message}`);
          }
        }
      }

      return <Text>{printResults.join('\n\n')}</Text>;
    } catch (err) {
      return <Text color="red">Error: {(err as Error).message}</Text>;
    }
  }

  // Execute the operation when confirmed or forced
  useEffect(() => {
    if ((confirmed === true || force) && results.length === 0 && error === null) {
      try {
        const outputResults: string[] = [];

        if (useGlobal) {
          // Write to global configs
          for (const client of selectedClients) {
            if (client.supportsWrite && client.runWrite) {
              try {
                const output = client.runWrite(projectFilter);
                outputResults.push(output);
              } catch (err) {
                outputResults.push(`${client.displayName}: Error - ${(err as Error).message}`);
              }
              continue;
            }

            if (client.printOnly && client.runPrint) {
              try {
                const output = client.runPrint(projectFilter);
                outputResults.push(output);
              } catch (err) {
                outputResults.push(`${client.displayName}: Error - ${(err as Error).message}`);
              }
              continue;
            }

            outputResults.push(`${client.displayName}: Error - write not supported.`);
          }
        } else {
          // Write to local configs
          for (const { client } of localClients) {
            try {
              const output = client.runWrite(projectFilter);
              outputResults.push(output);
            } catch (err) {
              outputResults.push(`${client.displayName}: Error - ${(err as Error).message}`);
            }
          }

          // Also handle print-only clients
          for (const client of printOnlyClients) {
            if (client.runPrint) {
              try {
                const output = client.runPrint(projectFilter);
                outputResults.push(output);
              } catch (err) {
                outputResults.push(`${client.displayName}: Error - ${(err as Error).message}`);
              }
            }
          }
        }

        setResults(outputResults);
      } catch (err) {
        setError((err as Error).message);
      }
    }
  }, [confirmed, force, options.client, projectFilter, useGlobal]);

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (results.length > 0) {
    return <Text>{results.join('\n\n')}</Text>;
  }

  if (confirmed === false) {
    return (
      <Box>
        <Text color="yellow">Operation cancelled.</Text>
      </Box>
    );
  }

  // Show confirmation prompt (unless force flag is set)
  if (!force) {
    return (
      <Confirm
        message={warningMessage}
        onConfirm={() => setConfirmed(true)}
        onCancel={() => setConfirmed(false)}
        defaultYes={false}
      />
    );
  }

  // Force mode - show loading or execute
  return (
    <Box>
      <Text>Updating configs...</Text>
    </Box>
  );
}
