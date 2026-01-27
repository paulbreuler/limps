import { Text, Box } from 'ink';
import { z } from 'zod';
import { useState, useEffect } from 'react';
import {
  configAddClaude,
  configAddCursor,
  configAddClaudeCode,
  configAddCodex,
  generateChatGptInstructions,
  generateConfigForPrint,
  previewMcpClientConfig,
} from '../../cli/config-cmd.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';
import { getAdapter } from '../../cli/mcp-client-adapter.js';
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
    .enum(['claude', 'cursor', 'claude-code', 'codex', 'chatgpt', 'all'])
    .optional()
    .default('all')
    .describe(
      'MCP client to configure (claude, cursor, claude-code, codex, chatgpt, or all). Default: all'
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

  const clientsToShow: string[] = [];
  const diffBlocks: string[] = [];
  let hasAnyChanges = false;
  if (options.client === 'claude' || options.client === 'all') {
    clientsToShow.push('Claude Desktop');
    if (!force) {
      try {
        const adapter = getAdapter('claude');
        const preview = previewMcpClientConfig(adapter, () => resolveConfigPath(), projectFilter);
        if (preview.hasChanges) {
          hasAnyChanges = true;
          diffBlocks.push(`--- Claude Desktop (${preview.configPath}) ---\n${preview.diffText}`);
        }
      } catch (err) {
        diffBlocks.push(`--- Claude Desktop ---\nError: ${(err as Error).message}`);
      }
    }
  }
  if (options.client === 'cursor' || options.client === 'all') {
    clientsToShow.push('Cursor');
    if (!force) {
      try {
        const adapter = getAdapter('cursor');
        const preview = previewMcpClientConfig(adapter, () => resolveConfigPath(), projectFilter);
        if (preview.hasChanges) {
          hasAnyChanges = true;
          diffBlocks.push(`--- Cursor (${preview.configPath}) ---\n${preview.diffText}`);
        }
      } catch (err) {
        diffBlocks.push(`--- Cursor ---\nError: ${(err as Error).message}`);
      }
    }
  }
  if (options.client === 'claude-code' || options.client === 'all') {
    clientsToShow.push('Claude Code');
    if (!force) {
      try {
        const adapter = getAdapter('claude-code');
        const preview = previewMcpClientConfig(adapter, () => resolveConfigPath(), projectFilter);
        if (preview.hasChanges) {
          hasAnyChanges = true;
          diffBlocks.push(`--- Claude Code (${preview.configPath}) ---\n${preview.diffText}`);
        }
      } catch (err) {
        diffBlocks.push(`--- Claude Code ---\nError: ${(err as Error).message}`);
      }
    }
  }
  if (options.client === 'codex' || options.client === 'all') {
    clientsToShow.push('OpenAI Codex');
    if (!force) {
      try {
        const adapter = getAdapter('codex');
        const preview = previewMcpClientConfig(adapter, () => resolveConfigPath(), projectFilter);
        if (preview.hasChanges) {
          hasAnyChanges = true;
          diffBlocks.push(`--- OpenAI Codex (${preview.configPath}) ---\n${preview.diffText}`);
        }
      } catch (err) {
        diffBlocks.push(`--- OpenAI Codex ---\nError: ${(err as Error).message}`);
      }
    }
  }
  if (options.client === 'chatgpt' || options.client === 'all') {
    clientsToShow.push('ChatGPT');
  }

  const diffSection =
    diffBlocks.length > 0 ? `\n\nConfig diff (preview):\n${diffBlocks.join('\n\n')}` : '';
  const includesChatGpt = options.client === 'chatgpt' || options.client === 'all';
  const changeNote =
    !force && !hasAnyChanges && !includesChatGpt ? '\n\nNo config changes detected.' : '';
  const chatGptNote = includesChatGpt
    ? '\n\nChatGPT uses manual connector setup; no local config files will be written.'
    : '';
  const warningMessage = `This will add/update ${projectsToShow.length} project(s) (${projectsToShow.map((p) => p.name).join(', ')}) in ${clientsToShow.join(', ')} configuration outputs.${diffSection}${changeNote}${chatGptNote}`;

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

      if (options.client === 'codex' || options.client === 'all') {
        try {
          const adapter = getAdapter('codex');
          const output = generateConfigForPrint(adapter, () => resolveConfigPath(), projectFilter);
          printResults.push(output);
        } catch (err) {
          printResults.push(`OpenAI Codex: Error - ${(err as Error).message}`);
        }
      }

      if (options.client === 'chatgpt' || options.client === 'all') {
        try {
          const output = generateChatGptInstructions(() => resolveConfigPath(), projectFilter);
          printResults.push(output);
        } catch (err) {
          printResults.push(`ChatGPT: Error - ${(err as Error).message}`);
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

        if (options.client === 'codex' || options.client === 'all') {
          try {
            const output = configAddCodex(() => resolveConfigPath(), projectFilter);
            outputResults.push(output);
          } catch (err) {
            outputResults.push(`OpenAI Codex: Error - ${(err as Error).message}`);
          }
        }

        if (options.client === 'chatgpt' || options.client === 'all') {
          try {
            const output = generateChatGptInstructions(() => resolveConfigPath(), projectFilter);
            outputResults.push(output);
          } catch (err) {
            outputResults.push(`ChatGPT: Error - ${(err as Error).message}`);
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
