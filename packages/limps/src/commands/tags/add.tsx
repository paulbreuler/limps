import { Text } from 'ink';
import React, { useEffect } from 'react';
import { join } from 'path';
import { z } from 'zod';
import { handleManageTags } from '../../tools/manage-tags.js';
import { loadConfig } from '../../config.js';
import { resolveConfigPath } from '../../utils/config-resolver.js';
import { initializeDatabase, createSchema } from '../../indexer.js';
import { buildHelpOutput } from '../../utils/cli-help.js';
import { isJsonMode, outputJson, wrapError, wrapSuccess } from '../../cli/json-output.js';
import type { ManageTagsOutput } from '../../tools/manage-tags.js';

export const description = 'Add tags to a document';

export const args = z.tuple([z.string().describe('path to document').min(1)]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().describe('Output as JSON'),
  tags: z.array(z.string()).optional().describe('Tags to add (space-separated)'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function TagsAddCommand({ args, options }: Props): React.ReactNode {
  const path = args[0];
  // Get tags from options or from remaining args
  const tags = options.tags || args.slice(1);
  const help = buildHelpOutput({
    usage: 'limps tags add <path> [options]',
    arguments: ['path Path to the document'],
    options: [
      '--config Path to config file',
      '--json Output as JSON',
      '--tags Tags to add (space-separated)',
    ],
    examples: [
      'limps tags add plans/0001-feature/000-agent.md --tags reviewed',
      'limps tags add plans/0001-feature/000-agent.md --tags urgent high-priority',
      'limps tags add plans/0001-feature/000-agent.md --tags reviewed --json',
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
          if (!path) {
            outputJson(wrapError('Path is required', { code: 'MISSING_PATH', help: help.meta }), 1);
            return;
          }

          if (!tags || tags.length === 0) {
            outputJson(
              wrapError('At least one tag is required', { code: 'MISSING_TAGS', help: help.meta }),
              1
            );
            return;
          }

          const configPath = resolveConfigPath(options.config);
          const config = loadConfig(configPath);
          const dbPath = join(config.dataPath, 'documents.sqlite');
          const db = initializeDatabase(dbPath);
          createSchema(db);

          const result = await handleManageTags(
            { path, operation: 'add', tags, prettyPrint: false },
            { db, config }
          );

          db.close();

          if (result.isError) {
            outputJson(wrapError(result.content[0].text, { code: 'TAGS_ADD_ERROR' }), 1);
            return;
          }

          const output = JSON.parse(result.content[0].text) as ManageTagsOutput;
          outputJson(wrapSuccess(output));
        } catch (error) {
          outputJson(
            wrapError(error instanceof Error ? error.message : String(error), {
              code: 'TAGS_ADD_ERROR',
            }),
            1
          );
        }
      })();
    }, 0);

    return () => clearTimeout(timer);
  }, [help.meta, jsonMode, options.config, path, tags]);

  if (jsonMode) {
    return null;
  }

  if (!path || !tags || tags.length === 0) {
    return <Text>{help.text}</Text>;
  }

  const configPath = resolveConfigPath(options.config);
  const config = loadConfig(configPath);

  const [result, setResult] = React.useState<ManageTagsOutput | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const run = async (): Promise<void> => {
      let db;
      try {
        const dbPath = join(config.dataPath, 'documents.sqlite');
        db = initializeDatabase(dbPath);
        createSchema(db);

        const toolResult = await handleManageTags(
          { path, operation: 'add', tags, prettyPrint: false },
          { db, config }
        );

        if (toolResult.isError) {
          setError(toolResult.content[0].text);
        } else {
          setResult(JSON.parse(toolResult.content[0].text) as ManageTagsOutput);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        if (db) {
          db.close();
        }
      }
    };

    void run();
  }, [config, path, tags]);

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (!result) {
    return <Text>Loading...</Text>;
  }

  return (
    <>
      <Text color="green">✓ Successfully added tags to {result.path}</Text>
      <Text color="cyan" bold>
        Current tags:
      </Text>
      {result.tags.map((tag) => (
        <Text key={tag}> • {tag}</Text>
      ))}
    </>
  );
}
