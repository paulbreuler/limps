import { Text } from 'ink';
import React, { useEffect, useState } from 'react';
import { z } from 'zod';
import { listDocs, getDocsListData } from '../cli/docs-list.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { handleJsonOutput, isJsonMode, outputJson, wrapError } from '../cli/json-output.js';

export const description = 'List files and directories';

export const args = z.tuple([z.string().describe('directory path (optional)').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  depth: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe('Max directory depth (1-5, default: 2)'),
  pattern: z.string().optional().describe('Glob pattern (e.g., "*.md")'),
  includeHidden: z.boolean().optional().describe('Include hidden files'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function ListDocsCommand({ args, options }: Props): React.ReactNode {
  const [path] = args;
  const jsonMode = isJsonMode(options);

  useEffect((): (() => void) | undefined => {
    if (jsonMode) {
      const timer = setTimeout((): void => {
        (async (): Promise<void> => {
          try {
            const configPath = resolveConfigPath(options.config);
            const config = loadConfig(configPath);

            const result = await getDocsListData(config, {
              path,
              pattern: options.pattern,
              depth: options.depth,
              includeHidden: options.includeHidden,
            });

            handleJsonOutput(() => {
              if ('error' in result) {
                throw new Error(result.error);
              }
              return result;
            }, 'LIST_DOCS_ERROR');
          } catch (error) {
            outputJson(
              wrapError(error instanceof Error ? error.message : String(error), {
                code: 'LIST_DOCS_ERROR',
              }),
              1
            );
          }
        })();
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [jsonMode, options.config, path, options.pattern, options.depth, options.includeHidden]);

  if (jsonMode) {
    return null;
  }

  // Normal Ink rendering
  const [output, setOutput] = useState<string>('Loading...');

  useEffect(() => {
    (async (): Promise<void> => {
      try {
        const configPath = resolveConfigPath(options.config);
        const config = loadConfig(configPath);
        const result = await listDocs(config, {
          path,
          pattern: options.pattern,
          depth: options.depth,
          includeHidden: options.includeHidden,
        });
        setOutput(result);
      } catch (error) {
        setOutput(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  }, [options.config, path, options.pattern, options.depth, options.includeHidden]);

  return <Text>{output}</Text>;
}
