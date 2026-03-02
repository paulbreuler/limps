import React from 'react';
import { Text, Box } from 'ink';
import { z } from 'zod';
import { join } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import matter from 'gray-matter';
import { loadCommandContext } from '../../core/command-context.js';
import { isJsonMode, handleJsonOutput } from '../../cli/json-output.js';

export const description = 'List agents from a plan spec for bulk creation guidance';

export const args = z.tuple([z.string().describe('Plan ID (e.g., "0001-feature-name")')]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().default(false),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

interface AgentSummary {
  file: string;
  title: string;
  status: string;
  persona: string;
}

export default function GenAgents({ args: [planId], options: opts }: Props): React.JSX.Element {
  const { config } = loadCommandContext(opts.config);
  const plansPath = config.workspacePath ?? config.plansPath;
  const agentsDir = join(plansPath, planId, 'agents');

  if (!existsSync(agentsDir)) {
    if (isJsonMode(opts)) {
      handleJsonOutput(
        () => ({
          planId,
          agents: [],
          next_steps: [
            `Use 'limps gen agent ${planId} "<title>"' to create individual agents`,
            `Or use 'generate_artifact' MCP tool with type: "agent"`,
          ],
        }),
        'GEN_AGENTS_ERROR'
      );
    }
    return (
      <Box flexDirection="column">
        <Text color="yellow">No agents directory found for plan: {planId}</Text>
        <Text dimColor>
          Create agents with: limps gen agent {planId} {'<title>'}
        </Text>
      </Box>
    );
  }

  const files = readdirSync(agentsDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const agents: AgentSummary[] = files.map((file) => {
    const content = readFileSync(join(agentsDir, file), 'utf-8');
    const { data } = matter(content);
    return {
      file,
      title: (data.title as string) ?? file.replace(/\.md$/, ''),
      status: (data.status as string) ?? 'GAP',
      persona: (data.persona as string) ?? 'coder',
    };
  });

  if (isJsonMode(opts)) {
    handleJsonOutput(
      () => ({
        planId,
        agents,
        total: agents.length,
        next_steps: [
          'Use validate_invest on each agent to check INVEST compliance',
          `Use 'limps plan check invest ${planId}' for a summary`,
        ],
      }),
      'GEN_AGENTS_ERROR'
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Agents for plan: {planId}</Text>
      <Text> </Text>
      {agents.length === 0 ? (
        <Text dimColor>
          No agents found. Create with: limps gen agent {planId} {'<title>'}
        </Text>
      ) : (
        agents.map((a) => (
          <Text key={a.file}>
            <Text color="cyan">{a.file.padEnd(30)}</Text>
            <Text color={a.status === 'PASS' ? 'green' : a.status === 'WIP' ? 'yellow' : 'white'}>
              {a.status.padEnd(10)}
            </Text>
            <Text>{a.title}</Text>
          </Text>
        ))
      )}
      <Text> </Text>
      <Text dimColor>Total: {agents.length} agents</Text>
    </Box>
  );
}
