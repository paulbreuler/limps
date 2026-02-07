import React, { useEffect } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { loadConfig } from '../../config.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';
import { buildHelpOutput } from '../../utils/cli-help.js';
import { handleJsonOutput, isJsonMode } from '../../cli/json-output.js';
import { openGraphDb } from '../../cli/graph-db.js';
import { graphSearch } from '../../cli/graph-search.js';

export const description = 'Search entities in the knowledge graph';

export const args = z.tuple([z.string().describe('search query')]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().describe('Output as JSON'),
  top: z.number().optional().describe('Number of results to return'),
  recipe: z.string().optional().describe('Search recipe name'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function GraphSearchCommand({ args, options }: Props): React.ReactNode {
  const [query] = args;
  const configPath = resolveConfigPath(options.config);
  const config = loadConfig(configPath);
  const jsonMode = isJsonMode(options);

  const help = buildHelpOutput({
    usage: 'limps graph search <query> [options]',
    arguments: ['query  Search query string'],
    options: [
      '--config Path to config file',
      '--json Output as JSON',
      '--top Number of results (default: 10)',
      '--recipe Search recipe name',
    ],
    sections: [
      {
        title: 'Examples',
        lines: [
          'limps graph search "auth"',
          'limps graph search "plan 0042" --top 5',
          'limps graph search "auth" --recipe LEXICAL_FIRST --json',
        ],
      },
    ],
  });

  useEffect((): (() => void) | undefined => {
    if (!jsonMode) return;
    const timer = setTimeout(async () => {
      try {
        const db = openGraphDb(config);
        try {
          const result = await graphSearch(config, db, query, {
            topK: options.top,
            recipe: options.recipe,
          });
          handleJsonOutput(() => result, 'GRAPH_SEARCH_ERROR');
        } finally {
          db.close();
        }
      } catch {
        // handleJsonOutput calls process.exit
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [jsonMode, config, query, options.top, options.recipe]);

  if (jsonMode) return null;

  if (!query) {
    return (
      <Text>
        <Text color="red">Error: search query is required</Text>
        {'\n\n'}
        {help.text}
      </Text>
    );
  }

  // For non-JSON mode, we need to handle async search
  return <GraphSearchResults config={config} query={query} options={options} help={help} />;
}

interface GraphSearchResultsProps {
  config: ReturnType<typeof loadConfig>;
  query: string;
  options: { top?: number; recipe?: string };
  help: ReturnType<typeof buildHelpOutput>;
}

function GraphSearchResults({
  config,
  query,
  options,
  help,
}: GraphSearchResultsProps): React.ReactNode {
  const [results, setResults] = React.useState<Awaited<ReturnType<typeof graphSearch>> | null>(
    null
  );
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    const db = openGraphDb(config);
    graphSearch(config, db, query, {
      topK: options.top,
      recipe: options.recipe,
    })
      .then(setResults)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => db.close());
  }, [config, query, options.top, options.recipe]);

  if (error) {
    return (
      <Text>
        <Text color="red">{error}</Text>
        {'\n\n'}
        {help.text}
      </Text>
    );
  }

  if (!results) {
    return <Text>Searching...</Text>;
  }

  if (results.results.length === 0) {
    return <Text>No results found for &quot;{query}&quot;</Text>;
  }

  return (
    <Text>
      {results.results.map((r, i) => (
        <React.Fragment key={r.entity.canonicalId}>
          {i > 0 && '\n'}
          <Text color="cyan">{r.entity.canonicalId}</Text> ({r.entity.type}) - {r.entity.name}{' '}
          <Text color="gray">score: {r.score.toFixed(3)}</Text>
        </React.Fragment>
      ))}
      {'\n'}
      <Text color="gray">
        {results.total} results (recipe: {results.recipe})
      </Text>
    </Text>
  );
}
