import React, { useEffect } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { loadCommandContext } from '../../core/command-context.js';
import { buildHelpOutput } from '../../utils/cli-help.js';
import { isJsonMode, outputJson, wrapError, wrapSuccess } from '../../cli/json-output.js';
import { convertDependenciesToPaths } from '../../cli/dependency-paths.js';

export const description = 'Convert numeric agent dependencies to file paths';

export const args = z.tuple([z.string().describe('plan id or name').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  check: z.boolean().optional().describe('Show conversion impact without writing files'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function PlanDepsToPathsCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;
  const jsonMode = isJsonMode(options);
  const context = loadCommandContext(options.config);

  const help = buildHelpOutput({
    usage: 'limps plan deps-to-paths [plan] [options]',
    options: [
      '--config Path to config file',
      '--check Preview changes without writing',
      '--json Output as JSON',
    ],
    sections: [
      {
        title: 'Examples',
        lines: [
          'limps plan deps-to-paths',
          'limps plan deps-to-paths 49',
          'limps plan deps-to-paths --check --json',
        ],
      },
    ],
  });

  useEffect((): (() => void) | undefined => {
    if (!jsonMode) {
      return;
    }

    const timer = setTimeout(() => {
      try {
        const result = convertDependenciesToPaths({
          plansPath: context.config.plansPath,
          planId,
          checkOnly: options.check,
        });
        outputJson(wrapSuccess(result));
      } catch (error) {
        outputJson(
          wrapError(error instanceof Error ? error.message : String(error), {
            code: 'PLAN_DEPS_TO_PATHS_ERROR',
          }),
          1
        );
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [context.config.plansPath, jsonMode, options.check, planId]);

  if (jsonMode) {
    return null;
  }

  try {
    const result = convertDependenciesToPaths({
      plansPath: context.config.plansPath,
      planId,
      checkOnly: options.check,
    });

    const lines: string[] = [];
    lines.push(options.check ? 'Dependency path conversion preview' : 'Dependency path conversion complete');
    lines.push('');
    lines.push(`Plans processed: ${result.plansProcessed}`);
    lines.push(`Files scanned: ${result.filesScanned}`);
    lines.push(`Files updated: ${result.filesUpdated}`);
    lines.push(`Dependencies converted: ${result.dependenciesConverted}`);

    if (result.warnings.length > 0) {
      lines.push('');
      lines.push('Warnings:');
      for (const warning of result.warnings.slice(0, 20)) {
        lines.push(`  - ${warning}`);
      }
      if (result.warnings.length > 20) {
        lines.push(`  - ...and ${result.warnings.length - 20} more`);
      }
    }

    return <Text>{lines.join('\n')}</Text>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <Text>
        <Text color="red">{message}</Text>
        {'\n\n'}
        {help.text}
      </Text>
    );
  }
}
