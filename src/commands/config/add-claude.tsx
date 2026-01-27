import { Text, Box } from 'ink';
import { z } from 'zod';
import { useState, useEffect } from 'react';
import {
  configAddClaude,
  configAddCursor,
  configAddClaudeCode,
  generateConfigForPrint,
} from '../../cli/config-cmd.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';
import { getAdapter } from '../../cli/mcp-client-adapter.js';
import { Confirm } from '../../components/Confirm.js';
import { listProjects } from '../../cli/registry.js';

export const description =
  'Add or update all registered limps projects in MCP client configs (default: all projects, all clients)';

export const options = z.object({
  projects: z
    .string()
    .optional()
    .describe('Comma-separated list of project names to add (default: all registered projects)'),
  client: z
    .enum(['claude', 'cursor', 'claude-code', 'all'])
    .optional()
    .default('all')
    .describe('MCP client to configure (claude, cursor, claude-code, or all). Default: all'),
  print: z
    .boolean()
    .optional()
    .describe('Print config JSON instead of writing to files (for unsupported clients)'),
  force: z.boolean().optional().describe('Skip confirmation prompt (-f)'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function ConfigAddClaudeCommand({ options }: Props): React.ReactNode {
  // If force is set, skip confirmation
  const [confirmed, setConfirmed] = useState<boolean | null>(options.force ? true : null);
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const projectFilter = options.projects
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

  const clientsToShow: string[] = [];
  if (options.client === 'claude' || options.client === 'all') {
    clientsToShow.push('Claude Desktop');
  }
  if (options.client === 'cursor' || options.client === 'all') {
    clientsToShow.push('Cursor');
  }
  if (options.client === 'claude-code' || options.client === 'all') {
    clientsToShow.push('Claude Code');
  }

  const warningMessage = `This will add/update ${projectsToShow.length} project(s) (${projectsToShow.map((p) => p.name).join(', ')}) in ${clientsToShow.join(', ')} config files.`;

  // If --print, just output the JSON format (no confirmation needed)
  if (options.print) {
    try {
      const printResults: string[] = [];

      if (options.client === 'claude' || options.client === 'all') {
        try {
          const adapter = getAdapter('claude');
          const output = generateConfigForPrint(adapter, () => resolveConfigPath(), projectFilter);
          printResults.push(output);
        } catch (err) {
          printResults.push(`Claude Desktop: Error - ${(err as Error).message}`);
        }
      }

      if (options.client === 'cursor' || options.client === 'all') {
        try {
          const adapter = getAdapter('cursor');
          const output = generateConfigForPrint(adapter, () => resolveConfigPath(), projectFilter);
          printResults.push(output);
        } catch (err) {
          printResults.push(`Cursor: Error - ${(err as Error).message}`);
        }
      }

      if (options.client === 'claude-code' || options.client === 'all') {
        try {
          const adapter = getAdapter('claude-code');
          const output = generateConfigForPrint(adapter, () => resolveConfigPath(), projectFilter);
          printResults.push(output);
        } catch (err) {
          printResults.push(`Claude Code: Error - ${(err as Error).message}`);
        }
      }

      return <Text>{printResults.join('\n\n')}</Text>;
    } catch (err) {
      return <Text color="red">Error: {(err as Error).message}</Text>;
    }
  }

  // Execute the operation when confirmed or forced
  useEffect(() => {
    if ((confirmed === true || options.force) && results.length === 0 && error === null) {
      try {
        const outputResults: string[] = [];

        if (options.client === 'claude' || options.client === 'all') {
          try {
            const output = configAddClaude(() => resolveConfigPath(), projectFilter);
            outputResults.push(output);
          } catch (err) {
            outputResults.push(`Claude Desktop: Error - ${(err as Error).message}`);
          }
        }

        if (options.client === 'cursor' || options.client === 'all') {
          try {
            const output = configAddCursor(() => resolveConfigPath(), projectFilter);
            outputResults.push(output);
          } catch (err) {
            outputResults.push(`Cursor: Error - ${(err as Error).message}`);
          }
        }

        if (options.client === 'claude-code' || options.client === 'all') {
          try {
            const output = configAddClaudeCode(() => resolveConfigPath(), projectFilter);
            outputResults.push(output);
          } catch (err) {
            outputResults.push(`Claude Code: Error - ${(err as Error).message}`);
          }
        }

        setResults(outputResults);
      } catch (err) {
        setError((err as Error).message);
      }
    }
  }, [confirmed, options.force, options.client, projectFilter]);

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
  if (!options.force) {
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
