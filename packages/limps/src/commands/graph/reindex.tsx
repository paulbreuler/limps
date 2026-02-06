import React, { useEffect } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { loadConfig } from '../../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../../utils/config-resolver.js';
import { buildHelpOutput, getProjectLlmHints, getProjectTipLine } from '../../utils/cli-help.js';
import { handleJsonOutput, isJsonMode } from '../../cli/json-output.js';
import { openGraphDb } from '../../cli/graph-db.js';
import { graphReindex } from '../../cli/graph-reindex.js';

export const description = 'Rebuild the knowledge graph from plan files';

export const args = z.tuple([]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  project: z.string().optional().describe('Registered project name'),
  json: z.boolean().optional().describe('Output as JSON'),
  plan: z.string().optional().describe('Filter to specific plan ID'),
  incremental: z.boolean().optional().describe('Skip unchanged files'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function GraphReindexCommand({ options }: Props): React.ReactNode {
  const configPath = options.project
    ? resolveProjectConfigPath(options.project)
    : resolveConfigPath(options.config);
  const config = loadConfig(configPath);
  const jsonMode = isJsonMode(options);

  const help = buildHelpOutput({
    usage: 'limps graph reindex [options]',
    options: [
      '--config Path to config file',
      '--project Registered project name',
      '--json Output as JSON',
      '--plan Filter to specific plan ID',
      '--incremental Skip unchanged files',
    ],
    sections: [
      {
        title: 'Examples',
        lines: [
          'limps graph reindex',
          'limps graph reindex --plan 0042',
          'limps graph reindex --json',
        ],
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
            return graphReindex(config, db, {
              planId: options.plan,
              incremental: options.incremental,
            });
          } finally {
            db.close();
          }
        }, 'GRAPH_REINDEX_ERROR');
      } catch {
        // handleJsonOutput calls process.exit
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [jsonMode, config, options.plan, options.incremental]);

  if (jsonMode) return null;

  try {
    const db = openGraphDb(config);
    try {
      const result = graphReindex(config, db, {
        planId: options.plan,
        incremental: options.incremental,
      });
      return (
        <Text>
          <Text color="green">Graph reindex complete.</Text>
          {'\n'}Plans: {result.plansProcessed}, Entities: {result.entitiesUpserted}, Relations:{' '}
          {result.relationshipsUpserted}
          {result.warnings.length > 0 && (
            <>
              {'\n'}
              <Text color="yellow">Warnings: {result.warnings.join(', ')}</Text>
            </>
          )}
        </Text>
      );
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
