import React, { useEffect } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { loadConfig } from '../../config.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';
import { buildHelpOutput } from '../../utils/cli-help.js';
import { handleJsonOutput, isJsonMode } from '../../cli/json-output.js';
import { openGraphDb } from '../../cli/graph-db.js';
import { graphOverlap } from '../../cli/graph-overlap.js';

export const description = 'Find overlapping features';

export const args = z.tuple([]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().describe('Output as JSON'),
  plan: z.string().optional().describe('Filter to specific plan ID'),
  threshold: z.number().optional().describe('Similarity threshold (0-1)'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function GraphOverlapCommand({ options }: Props): React.ReactNode {
  const configPath = resolveConfigPath(options.config);
  const config = loadConfig(configPath);
  const jsonMode = isJsonMode(options);

  const help = buildHelpOutput({
    usage: 'limps graph overlap [options]',
    options: [
      '--config Path to config file',
      '--json Output as JSON',
      '--plan Filter to specific plan ID',
      '--threshold Similarity threshold (default: 0.8)',
    ],
    sections: [
      {
        title: 'Examples',
        lines: ['limps graph overlap', 'limps graph overlap --plan 0042 --json'],
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
            return graphOverlap(config, db, {
              planId: options.plan,
              threshold: options.threshold,
            });
          } finally {
            db.close();
          }
        }, 'GRAPH_OVERLAP_ERROR');
      } catch {
        // handleJsonOutput calls process.exit
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [jsonMode, config, options.plan, options.threshold]);

  if (jsonMode) return null;

  try {
    const db = openGraphDb(config);
    try {
      const result = graphOverlap(config, db, {
        planId: options.plan,
        threshold: options.threshold,
      });
      return (
        <Text>
          Features analyzed: {result.totalFeatures}
          {'\n'}Duplicates: {result.duplicates.length}
          {'\n'}Similar: {result.similar.length}
          {result.suggestions.length > 0 && (
            <>
              {'\n\n'}Suggestions:
              {result.suggestions.map((s, i) => (
                <React.Fragment key={i}>
                  {'\n'}
                  {'  '}
                  {s}
                </React.Fragment>
              ))}
            </>
          )}
          {result.suggestions.length === 0 && <>{'\n\n'}No overlaps detected.</>}
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
