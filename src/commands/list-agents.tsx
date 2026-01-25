import { Text } from 'ink';
import { z } from 'zod';
import { getAgentsData } from '../cli/list-agents.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { AgentsList } from '../components/AgentsList.js';

export const description = 'List agents in a plan';

export const args = z.tuple([z.string().describe('plan id or name').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function ListAgentsCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;

  if (!planId) {
    return (
      <Text>
        <Text color="yellow">Usage:</Text> limps list-agents {'<plan>'} [options]
        {'\n\n'}
        <Text color="cyan">Arguments:</Text>
        {'\n'}
        {'  '}plan Plan ID or name (e.g., "4" or "0004-feature-name")
        {'\n\n'}
        <Text color="cyan">Options:</Text>
        {'\n'}
        {'  '}--config Path to config file
        {'\n\n'}
        <Text color="cyan">Examples:</Text>
        {'\n'}
        {'  '}limps list-agents 4{'\n'}
        {'  '}limps list-agents 0004-my-feature
      </Text>
    );
  }

  try {
    const configPath = resolveConfigPath(options.config);
    const config = loadConfig(configPath);
    const result = getAgentsData(config, planId);

    if ('error' in result) {
      return <Text color="red">Error: {result.error}</Text>;
    }

    return (
      <AgentsList
        planName={result.planName}
        agents={result.agents}
        statusCounts={result.statusCounts}
        total={result.total}
      />
    );
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
