import React from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { getPlanStatusSummary, getAgentStatusSummary } from '../cli/status.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { PlanStatus } from '../components/PlanStatus.js';
import { AgentStatus } from '../components/AgentStatus.js';
import { handleJsonOutput, isJsonMode, outputJson, wrapError } from '../cli/json-output.js';
import { resolveTaskId } from '../cli/task-resolver.js';

export const description = 'Show plan or agent status';

export const args = z.tuple([z.string().describe('plan id or name').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().describe('Output as JSON'),
  agent: z
    .string()
    .optional()
    .describe('Show detailed status for specific agent (e.g., "0001#002" or "002")'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

interface AgentStatusLoaderProps {
  agentId: string;
  planContext: string | undefined;
  config: ReturnType<typeof loadConfig>;
}

function AgentStatusLoader({
  agentId,
  planContext,
  config,
}: AgentStatusLoaderProps): React.ReactNode {
  const [summary, setSummary] = React.useState<Awaited<
    ReturnType<typeof getAgentStatusSummary>
  > | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const run = async (): Promise<void> => {
      try {
        const resolvedId = resolveTaskId(agentId, {
          plansPath: config.plansPath,
          planContext,
        });
        const result = getAgentStatusSummary(config, resolvedId);
        setSummary(result);
      } catch (err) {
        setError((err as Error).message);
      }
    };
    void run();
  }, [agentId, planContext, config]);

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (!summary) {
    return <Text>Loading...</Text>;
  }

  return <AgentStatus summary={summary} />;
}

export default function StatusCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;
  const configPath = resolveConfigPath(options.config);
  const config = loadConfig(configPath);

  // Handle agent-specific status
  if (options.agent) {
    const agentId = options.agent;

    // Handle JSON output mode for agent status
    if (isJsonMode(options)) {
      return handleJsonOutput(() => {
        const resolvedId = resolveTaskId(agentId, {
          plansPath: config.plansPath,
          planContext: planId,
        });
        return getAgentStatusSummary(config, resolvedId);
      }, 'AGENT_STATUS_ERROR');
    }

    // Render agent status component
    return <AgentStatusLoader agentId={agentId} planContext={planId} config={config} />;
  }

  // Handle JSON output mode for plan status
  if (isJsonMode(options)) {
    if (!planId) {
      return outputJson(wrapError('Plan ID is required', { code: 'MISSING_PLAN_ID' }), 1);
    }

    return handleJsonOutput(() => {
      return getPlanStatusSummary(config, planId);
    }, 'STATUS_ERROR');
  }

  if (!planId) {
    return (
      <Text>
        <Text color="yellow">Usage:</Text> limps status {'<plan>'} [options]
        {'\n\n'}
        <Text color="cyan">Arguments:</Text>
        {'\n'}
        {'  '}plan Plan ID or name (e.g., "4" or "0004-feature-name")
        {'\n\n'}
        <Text color="cyan">Options:</Text>
        {'\n'}
        {'  '}--config Path to config file
        {'\n'}
        {'  '}--json Output as JSON
        {'\n'}
        {'  '}--agent Show detailed status for specific agent
        {'\n\n'}
        <Text color="cyan">Agent Status Examples:</Text>
        {'\n'}
        {'  '}limps status --agent 0001#002{'\n'}
        {'  '}limps status 0001 --agent 002{'\n'}
        {'  '}limps status --agent 0001#002 --json
        {'\n\n'}
        <Text color="cyan">Plan Status Examples:</Text>
        {'\n'}
        {'  '}limps status 4{'\n'}
        {'  '}limps status 0004-my-feature{'\n'}
        {'  '}limps status 4 --json
      </Text>
    );
  }

  try {
    const summary = getPlanStatusSummary(config, planId);
    return <PlanStatus summary={summary} />;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
