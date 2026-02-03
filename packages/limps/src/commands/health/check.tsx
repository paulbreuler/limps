import React, { useEffect } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { loadConfig } from '../../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../../utils/config-resolver.js';
import { buildHelpOutput, getProjectLlmHints, getProjectTipLine } from '../../utils/cli-help.js';
import { runHealthCheck, renderHealthCheckSummary } from '../../cli/health-check.js';
import { handleJsonOutput, isJsonMode } from '../../cli/json-output.js';

export const description = 'Run full health check (staleness + inference + drift)';

export const args = z.tuple([z.string().describe('plan id or name').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  project: z.string().optional().describe('Registered project name'),
  json: z.boolean().optional().describe('Output as JSON'),
  codebase: z.string().optional().describe('Path to codebase (for drift check)'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function HealthCheckCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;
  const configPath = options.project
    ? resolveProjectConfigPath(options.project)
    : resolveConfigPath(options.config);
  const config = loadConfig(configPath);
  const jsonMode = isJsonMode(options);

  const help = buildHelpOutput({
    usage: 'limps health check [plan] [options]',
    arguments: ['plan Plan ID or name (optional)'],
    options: [
      '--config Path to config file',
      '--project Registered project name',
      '--json Output as JSON',
      '--codebase Path to codebase (for drift)',
    ],
    sections: [
      {
        title: 'Examples',
        lines: [
          'limps health check',
          'limps health check 0033',
          'limps health check 0033 --codebase ./packages/limps',
          'limps health check --json',
        ],
      },
    ],
    tips: [getProjectTipLine()],
    llmHints: getProjectLlmHints(),
  });

  useEffect((): (() => void) | undefined => {
    if (!jsonMode) {
      return;
    }
    const timer = setTimeout(() => {
      try {
        handleJsonOutput(() => {
          const result = runHealthCheck(config, {
            planId: planId ?? undefined,
            codebasePath: options.codebase,
          });
          return {
            summary: result.summary,
            staleness: {
              total: result.staleness.stale.length,
              warning: result.staleness.summary.warning,
              critical: result.staleness.summary.critical,
            },
            inference: result.inference,
            ...(result.drift && { drift: result.drift }),
          };
        }, 'HEALTH_CHECK_ERROR');
      } catch {
        // handleJsonOutput calls process.exit
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [jsonMode, config, planId, options.codebase]);

  if (jsonMode) {
    return null;
  }

  try {
    const result = runHealthCheck(config, {
      planId: planId ?? undefined,
      codebasePath: options.codebase,
    });
    return <Text>{renderHealthCheckSummary(result)}</Text>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return (
      <Text>
        <Text color="red">{message}</Text>
        {'\n\n'}
        {help.text}
      </Text>
    );
  }
}
