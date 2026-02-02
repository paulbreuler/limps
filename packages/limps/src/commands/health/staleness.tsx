import React, { useEffect } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { loadConfig } from '../../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../../utils/config-resolver.js';
import { buildHelpOutput, getProjectLlmHints, getProjectTipLine } from '../../utils/cli-help.js';
import { getStalenessReport, renderStalenessReport } from '../../cli/health-staleness.js';
import { handleJsonOutput, isJsonMode, outputJson, wrapError } from '../../cli/json-output.js';

export const description = 'Check for stale plans and agents';

export const args = z.tuple([z.string().describe('plan id or name').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  project: z.string().optional().describe('Registered project name'),
  json: z.boolean().optional().describe('Output as JSON'),
  days: z.number().optional().describe('Override staleness warning threshold in days'),
  includePass: z.boolean().optional().describe('Include PASS items in output'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function HealthStalenessCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;
  const configPath = options.project
    ? resolveProjectConfigPath(options.project)
    : resolveConfigPath(options.config);
  const config = loadConfig(configPath);
  const jsonMode = isJsonMode(options);

  const help = buildHelpOutput({
    usage: 'limps health staleness [plan] [options]',
    arguments: ['plan Plan ID or name (optional)'],
    options: [
      '--config Path to config file',
      '--project Registered project name',
      '--json Output as JSON',
      '--days Override staleness warning threshold',
      '--include-pass Include PASS items',
    ],
    sections: [
      {
        title: 'Examples',
        lines: [
          'limps health staleness',
          'limps health staleness 0033',
          'limps health staleness 0033 --days 7',
          'limps health staleness --json',
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
        return handleJsonOutput(
          () =>
            getStalenessReport(config, {
              planId,
              thresholdDays: options.days,
              includePass: options.includePass,
            }),
          'STALENESS_ERROR'
        );
      } catch (error) {
        outputJson(
          wrapError(error instanceof Error ? error.message : String(error), {
            code: 'STALENESS_ERROR',
            help: help.meta,
          }),
          1
        );
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [config, help.meta, jsonMode, options.days, options.includePass, planId]);

  if (jsonMode) {
    return null;
  }

  try {
    const report = getStalenessReport(config, {
      planId,
      thresholdDays: options.days,
      includePass: options.includePass,
    });
    return <Text>{renderStalenessReport(report)}</Text>;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
