import React, { useEffect } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { loadConfig } from '../../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../../utils/config-resolver.js';
import { buildHelpOutput, getProjectLlmHints, getProjectTipLine } from '../../utils/cli-help.js';
import { handleJsonOutput, isJsonMode } from '../../cli/json-output.js';
import { openGraphDb } from '../../cli/graph-db.js';
import { graphTrace } from '../../cli/graph-trace.js';

export const description = 'Trace entity relationships';

export const args = z.tuple([z.string().describe('entity canonical ID')]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  project: z.string().optional().describe('Registered project name'),
  json: z.boolean().optional().describe('Output as JSON'),
  direction: z.enum(['up', 'down', 'both']).optional().describe('Traversal direction'),
  depth: z.number().optional().describe('Max traversal depth'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function GraphTraceCommand({ args, options }: Props): React.ReactNode {
  const [entityId] = args;
  const configPath = options.project
    ? resolveProjectConfigPath(options.project)
    : resolveConfigPath(options.config);
  const config = loadConfig(configPath);
  const jsonMode = isJsonMode(options);

  const help = buildHelpOutput({
    usage: 'limps graph trace <entity> [options]',
    arguments: ['entity  Entity canonical ID (e.g. plan:0042, agent:0042#003)'],
    options: [
      '--config Path to config file',
      '--project Registered project name',
      '--json Output as JSON',
      '--direction up|down|both (default: both)',
      '--depth Max traversal depth (default: 2)',
    ],
    sections: [
      {
        title: 'Examples',
        lines: [
          'limps graph trace plan:0042',
          'limps graph trace agent:0042#003 --direction up',
          'limps graph trace plan:0042 --depth 3 --json',
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
            return graphTrace(config, db, entityId, {
              direction: options.direction,
              depth: options.depth,
            });
          } finally {
            db.close();
          }
        }, 'GRAPH_TRACE_ERROR');
      } catch {
        // handleJsonOutput calls process.exit
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [jsonMode, config, entityId, options.direction, options.depth]);

  if (jsonMode) return null;

  if (!entityId) {
    return (
      <Text>
        <Text color="red">Error: entity canonical ID is required</Text>
        {'\n\n'}
        {help.text}
      </Text>
    );
  }

  try {
    const db = openGraphDb(config);
    try {
      const result = graphTrace(config, db, entityId, {
        direction: options.direction,
        depth: options.depth,
      });
      return (
        <Text>
          <Text color="cyan" bold>
            {result.root.canonicalId}
          </Text>{' '}
          ({result.root.type}) - {result.root.name}
          {'\n'}Direction: {result.direction}, Depth: {result.depth}
          {'\n'}Neighbors: {result.neighbors.length}, Relations: {result.relationships.length}
          {result.neighbors.map((n) => (
            <React.Fragment key={n.canonicalId}>
              {'\n'}
              {'  '}
              <Text color="green">{n.canonicalId}</Text> - {n.name}
            </React.Fragment>
          ))}
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
