import { Text, Box } from 'ink';
import { z } from 'zod';
import { useState, useEffect } from 'react';
import { getSyncClients, type McpSyncClient } from '../../cli/mcp-clients.js';
import { Confirm } from '../../components/Confirm.js';
import { listProjects } from '../../cli/registry.js';

export const description =
  'Add or update all registered limps projects in MCP client configs (default: all projects, all clients)';

export const args = z.tuple([
  z.string().describe('Project name (optional, overrides --projects)').optional(),
]);

export const options = z.object({
  projects: z
    .string()
    .optional()
    .describe('Comma-separated list of project names to add (default: all registered projects)'),
  client: z
    .enum(['claude', 'cursor', 'claude-code', 'codex', 'chatgpt', 'local', 'all'])
    .optional()
    .default('all')
    .describe(
      'MCP client to configure (claude, cursor, claude-code, codex, chatgpt, local, or all). Default: all'
    ),
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

  // Build warning message
  const allProjects = listProjects();
  const projectsToShow = projectFilter
    ? allProjects.filter((p) => projectFilter.includes(p.name))
    : allProjects;

  const allClients = getSyncClients();
  const selectedClients: McpSyncClient[] =
    options.client === 'all'
      ? allClients
      : allClients.filter((client) => client.id === options.client);

  const clientsToShow: string[] = selectedClients.map((client) => client.displayName);
  const diffBlocks: string[] = [];
  let hasAnyChanges = false;
  if (!force) {
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

    // Also preview local .mcp.json if it exists and wasn't already in selectedClients
    const hasLocalClient = selectedClients.some((c) => c.id === 'local');
    if (!hasLocalClient) {
      const localClient = allClients.find((c) => c.id === 'local');
      if (localClient && localClient.supportsPreview && localClient.runPreview) {
        try {
          const preview = localClient.runPreview(projectFilter);
          if (preview.hasChanges) {
            hasAnyChanges = true;
            diffBlocks.push(
              `--- ${localClient.displayName} (${preview.configPath}) ---\n${preview.diffText}`
            );
            // Add to clientsToShow for the confirmation message
            clientsToShow.push(localClient.displayName);
          }
        } catch (_err) {
          // Silently skip if local .mcp.json doesn't exist or can't be read
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
  const warningMessage = `This will add/update ${projectsToShow.length} project(s) (${projectsToShow.map((p) => p.name).join(', ')}) in ${clientsToShow.join(', ')} configuration outputs.${diffSection}${changeNote}${printOnlyNote}`;

  // If --print, just output the JSON format (no confirmation needed)
  if (options.print) {
    try {
      const printResults: string[] = [];

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

        // Also update local .mcp.json if it exists and wasn't already in selectedClients
        const hasLocalClient = selectedClients.some((c) => c.id === 'local');
        if (!hasLocalClient) {
          const localClient = allClients.find((c) => c.id === 'local');
          if (localClient && localClient.supportsWrite && localClient.runWrite) {
            try {
              const output = localClient.runWrite(projectFilter);
              outputResults.push(output);
            } catch (err) {
              outputResults.push(`${localClient.displayName}: Error - ${(err as Error).message}`);
            }
          }
        }

        setResults(outputResults);
      } catch (err) {
        setError((err as Error).message);
      }
    }
  }, [confirmed, force, options.client, projectFilter]);

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
