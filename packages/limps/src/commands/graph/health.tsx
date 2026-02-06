import React, { useEffect } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { loadConfig } from '../../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../../utils/config-resolver.js';
import { buildHelpOutput, getProjectLlmHints, getProjectTipLine } from '../../utils/cli-help.js';
import { handleJsonOutput, isJsonMode } from '../../cli/json-output.js';
import { openGraphDb } from '../../cli/graph-db.js';
import { graphHealth, renderGraphHealth } from '../../cli/graph-health.js';

export const description = 'Show graph statistics and conflict summary';

export const args = z.tuple([]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  project: z.string().optional().describe('Registered project name'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function GraphHealthCommand({ options }: Props): React.ReactNode {
  const configPath = options.project
    ? resolveProjectConfigPath(options.project)
    : resolveConfigPath(options.config);
  const config = loadConfig(configPath);
  const jsonMode = isJsonMode(options);

  const help = buildHelpOutput({
    usage: 'limps graph health [options]',
    options: [
      '--config Path to config file',
      '--project Registered project name',
      '--json Output as JSON',
    ],
    sections: [
      {
        title: 'Examples',
        lines: ['limps graph health', 'limps graph health --json'],
      },
    ],
    tips: [getProjectTipLine()],
    llmHints: getProjectLlmHints(),
  });

  useEffect((): (() => void) | undefined => {
    if (!jsonMode) return;
    const timer = setTimeout(() => {
      try {
        handleJsonOutput(() => {
          const db = openGraphDb(config);
          try {
            return graphHealth(config, db);
          } finally {
            db.close();
          }
        }, 'GRAPH_HEALTH_ERROR');
      } catch {
        // handleJsonOutput calls process.exit
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [jsonMode, config]);

  if (jsonMode) return null;

  try {
    const db = openGraphDb(config);
    try {
      const result = graphHealth(config, db);
      return <Text>{renderGraphHealth(result)}</Text>;
    } finally {
      db.close();
    }
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
