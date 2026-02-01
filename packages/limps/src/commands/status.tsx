import React from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { getPlanStatusSummary, getAgentStatusSummary } from '../cli/status.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../utils/config-resolver.js';
import { buildHelpOutput, getProjectLlmHints, getProjectTipLine } from '../utils/cli-help.js';
import { PlanStatus } from '../components/PlanStatus.js';
import { AgentStatus } from '../components/AgentStatus.js';
import { handleJsonOutput, isJsonMode, outputJson, wrapError } from '../cli/json-output.js';
import { useEffect } from 'react';
import { resolveTaskId } from '../cli/task-resolver.js';

export const description = 'Show plan or agent status';

export const args = z.tuple([z.string().describe('plan id or name').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  project: z.string().optional().describe('Registered project name'),
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
  const configPath = options.project
    ? resolveProjectConfigPath(options.project)
    : resolveConfigPath(options.config);
  const config = loadConfig(configPath);
  const help = buildHelpOutput({
    usage: 'limps status <plan> [options]',
    arguments: ['plan Plan ID or name (e.g., "4" or "0004-feature-name")'],
    options: [
      '--config Path to config file',
      '--project Registered project name',
      '--json Output as JSON',
      '--agent Show detailed status for specific agent',
    ],
    sections: [
      {
        title: 'Agent Status Examples',
        lines: [
          'limps status --agent 0001#002',
          'limps status 0001 --agent 002',
          'limps status --agent 0001#002 --json',
        ],
      },
      {
        title: 'Plan Status Examples',
        lines: ['limps status 4', 'limps status 0004-my-feature', 'limps status 4 --json'],
      },
    ],
    tips: [getProjectTipLine()],
    llmHints: getProjectLlmHints(),
  });
  const jsonMode = isJsonMode(options);

  useEffect((): (() => void) | undefined => {
    if (!jsonMode) {
      return;
    }
    const timer = setTimeout(() => {
      try {
        if (!planId) {
          outputJson(
            wrapError('Plan ID is required', { code: 'MISSING_PLAN_ID', help: help.meta }),
            1
          );
        }
        if (options.agent) {
          const agentId = options.agent;
          return handleJsonOutput(() => {
            const resolvedId = resolveTaskId(agentId, {
              plansPath: config.plansPath,
              planContext: planId,
            });
            return getAgentStatusSummary(config, resolvedId);
          }, 'AGENT_STATUS_ERROR');
        }
        return handleJsonOutput(() => getPlanStatusSummary(config, planId), 'STATUS_ERROR');
      } catch (error) {
        outputJson(
          wrapError(error instanceof Error ? error.message : String(error), {
            code: 'STATUS_ERROR',
          }),
          1
        );
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [config, help.meta, jsonMode, options.agent, planId]);

  // Handle agent-specific status
  if (options.agent) {
    const agentId = options.agent;

    if (jsonMode) {
      return null;
    }

    // Render agent status component
    return <AgentStatusLoader agentId={agentId} planContext={planId} config={config} />;
  }

  if (jsonMode) {
    return null;
  }

  if (!planId) {
    return <Text>{help.text}</Text>;
  }

  try {
    const summary = getPlanStatusSummary(config, planId);
    return <PlanStatus summary={summary} />;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
