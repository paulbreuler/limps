import React, { useEffect } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { loadConfig } from '../../config.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';
import { buildHelpOutput } from '../../utils/cli-help.js';
import { handleJsonOutput, isJsonMode } from '../../cli/json-output.js';
import { openGraphDb } from '../../cli/graph-db.js';
import { graphSuggest, type GraphSuggestType } from '../../cli/graph-suggest.js';

export const description = 'Get graph-based suggestions';

export const args = z.tuple([z.string().describe('suggestion type: consolidate or next-task')]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

const VALID_TYPES = ['consolidate', 'next-task'];

export default function GraphSuggestCommand({ args, options }: Props): React.ReactNode {
  const [typeArg] = args;
  const configPath = resolveConfigPath(options.config);
  const config = loadConfig(configPath);
  const jsonMode = isJsonMode(options);

  const help = buildHelpOutput({
    usage: 'limps graph suggest <type> [options]',
    arguments: ['type  Suggestion type: consolidate, next-task'],
    options: ['--config Path to config file', '--json Output as JSON'],
    sections: [
      {
        title: 'Examples',
        lines: ['limps graph suggest consolidate', 'limps graph suggest next-task --json'],
      },
    ],
  });

  const suggestType = VALID_TYPES.includes(typeArg) ? (typeArg as GraphSuggestType) : undefined;

  useEffect((): (() => void) | undefined => {
    if (!jsonMode) return;
    const timer = setTimeout(() => {
      try {
        handleJsonOutput(() => {
          if (!suggestType) {
            throw new Error(`Invalid type: ${typeArg}. Must be one of: ${VALID_TYPES.join(', ')}`);
          }
          const db = openGraphDb(config);
          try {
            return graphSuggest(config, db, suggestType);
          } finally {
            db.close();
          }
        }, 'GRAPH_SUGGEST_ERROR');
      } catch {
        // handleJsonOutput calls process.exit
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [jsonMode, config, suggestType, typeArg]);

  if (jsonMode) return null;

  if (!suggestType) {
    return (
      <Text>
        <Text color="red">Error: type must be one of: {VALID_TYPES.join(', ')}</Text>
        {'\n\n'}
        {help.text}
      </Text>
    );
  }

  try {
    const db = openGraphDb(config);
    try {
      const result = graphSuggest(config, db, suggestType);
      return (
        <Text>
          Type: {result.type}
          {result.suggestions.length > 0 ? (
            <>
              {result.suggestions.map((s, i) => (
                <React.Fragment key={i}>
                  {'\n'}
                  {'  '}
                  {s}
                </React.Fragment>
              ))}
            </>
          ) : (
            <>{'\n'}No suggestions.</>
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
