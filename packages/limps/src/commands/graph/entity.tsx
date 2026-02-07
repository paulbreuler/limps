import React, { useEffect } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { loadConfig } from '../../config.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';
import { buildHelpOutput } from '../../utils/cli-help.js';
import { handleJsonOutput, isJsonMode } from '../../cli/json-output.js';
import { openGraphDb } from '../../cli/graph-db.js';
import { graphEntity } from '../../cli/graph-entity.js';

export const description = 'Show details for a specific entity';

export const args = z.tuple([z.string().describe('entity canonical ID')]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function GraphEntityCommand({ args, options }: Props): React.ReactNode {
  const [canonicalId] = args;
  const configPath = resolveConfigPath(options.config);
  const config = loadConfig(configPath);
  const jsonMode = isJsonMode(options);

  const help = buildHelpOutput({
    usage: 'limps graph entity <canonical-id> [options]',
    arguments: ['canonical-id  Entity canonical ID (e.g. plan:0042)'],
    options: ['--config Path to config file', '--json Output as JSON'],
    sections: [
      {
        title: 'Examples',
        lines: ['limps graph entity plan:0042', 'limps graph entity agent:0042#003 --json'],
      },
    ],
  });

  useEffect((): (() => void) | undefined => {
    if (!jsonMode) return;
    const timer = setTimeout(() => {
      try {
        handleJsonOutput(() => {
          const db = openGraphDb(config);
          try {
            return graphEntity(config, db, canonicalId);
          } finally {
            db.close();
          }
        }, 'GRAPH_ENTITY_ERROR');
      } catch {
        // handleJsonOutput calls process.exit
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [jsonMode, config, canonicalId]);

  if (jsonMode) return null;

  if (!canonicalId) {
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
      const result = graphEntity(config, db, canonicalId);
      return (
        <Text>
          <Text color="cyan" bold>
            {result.entity.canonicalId}
          </Text>{' '}
          ({result.entity.type}){'\n'}Name: {result.entity.name}
          {result.entity.sourcePath && (
            <>
              {'\n'}Source: {result.entity.sourcePath}
            </>
          )}
          {'\n'}Outgoing: {result.outgoing.length}, Incoming: {result.incoming.length}
          {'\n'}Neighbors: {result.neighbors.length}
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
