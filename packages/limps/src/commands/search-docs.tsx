import { Text } from 'ink';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { searchDocs, getSearchDocsData } from '../cli/docs-search.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { buildHelpOutput } from '../utils/cli-help.js';
import { handleJsonOutput, isJsonMode, outputJson, wrapError } from '../cli/json-output.js';

export const description = 'Search documents using full-text search';

export const args = z.tuple([z.string().describe('search query')]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  limit: z.number().int().positive().max(100).optional().describe('Max results (default: 20)'),
  frontmatter: z.boolean().optional().describe('Search in frontmatter'),
  caseSensitive: z.boolean().optional().describe('Case-sensitive search'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function SearchDocsCommand({ args, options }: Props): React.ReactNode {
  const [query] = args;
  const help = buildHelpOutput({
    usage: 'limps search-docs <query> [options]',
    arguments: ['query Search query text'],
    options: [
      '--config Path to config file',
      '--limit Max results (default: 20)',
      '--frontmatter Search in frontmatter',
      '--case-sensitive Case-sensitive search',
      '--json Output as JSON',
    ],
    examples: [
      'limps search-docs "authentication"',
      'limps search-docs "API" --limit 10',
      'limps search-docs "status" --frontmatter',
    ],
  });

  const jsonMode = isJsonMode(options);

  useEffect((): (() => void) | undefined => {
    if (!jsonMode) {
      return;
    }
    const timer = setTimeout((): void => {
      (async (): Promise<void> => {
        try {
          if (!query) {
            outputJson(
              wrapError('Search query is required', { code: 'MISSING_QUERY', help: help.meta }),
              1
            );
            return;
          }

          const configPath = resolveConfigPath(options.config);
          const config = loadConfig(configPath);

          const result = await getSearchDocsData(config, {
            query,
            limit: options.limit,
            searchFrontmatter: options.frontmatter,
            caseSensitive: options.caseSensitive,
          });

          handleJsonOutput(() => {
            if ('error' in result) {
              throw new Error(result.error);
            }
            return result;
          }, 'SEARCH_DOCS_ERROR');
        } catch (error) {
          outputJson(
            wrapError(error instanceof Error ? error.message : String(error), {
              code: 'SEARCH_DOCS_ERROR',
            }),
            1
          );
        }
      })();
    }, 0);
    return () => clearTimeout(timer);
  }, [
    help.meta,
    jsonMode,
    options.config,
    query,
    options.limit,
    options.frontmatter,
    options.caseSensitive,
  ]);

  if (jsonMode) {
    return null;
  }

  if (!query) {
    return <Text>{help.text}</Text>;
  }

  // Normal Ink rendering
  const [output, setOutput] = useState<string>('Searching...');

  useEffect(() => {
    (async (): Promise<void> => {
      try {
        const configPath = resolveConfigPath(options.config);
        const config = loadConfig(configPath);
        const result = await searchDocs(config, {
          query,
          limit: options.limit,
          searchFrontmatter: options.frontmatter,
          caseSensitive: options.caseSensitive,
        });
        setOutput(result);
      } catch (error) {
        setOutput(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  }, [options.config, query, options.limit, options.frontmatter, options.caseSensitive]);

  return <Text>{output}</Text>;
}
