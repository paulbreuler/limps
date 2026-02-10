import { Text } from 'ink';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { deleteDoc, getDeleteDocData } from '../cli/docs-delete.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { buildHelpOutput } from '../utils/cli-help.js';
import { handleJsonOutput, isJsonMode, outputJson, wrapError } from '../cli/json-output.js';

export const description = 'Delete a document';

export const args = z.tuple([z.string().describe('document path')]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  confirm: z.boolean().optional().describe('Confirm deletion'),
  permanent: z.boolean().optional().describe('Permanent deletion (skip trash)'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function DeleteDocCommand({ args, options }: Props): React.ReactNode {
  const [path] = args;
  const help = buildHelpOutput({
    usage: 'limps delete-doc <path> [options]',
    arguments: ['path Path to document to delete'],
    options: [
      '--config Path to config file',
      '--confirm Confirm deletion',
      '--permanent Permanent deletion (skip trash)',
      '--json Output as JSON',
    ],
    examples: [
      'limps delete-doc "notes.md"',
      'limps delete-doc "notes.md" --confirm',
      'limps delete-doc "old-file.md" --confirm --permanent',
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
            outputJson(
              wrapError('Document path is required', { code: 'MISSING_PATH', help: help.meta }),
              1
            );
            return;
          }

          const configPath = resolveConfigPath(options.config);
          const config = loadConfig(configPath);

          const result = await getDeleteDocData(config, {
            path,
            confirm: options.confirm,
            permanent: options.permanent,
          });

          handleJsonOutput(() => {
            if ('error' in result) {
              throw new Error(result.error);
            }
            return result;
          }, 'DELETE_DOC_ERROR');
        } catch (error) {
          outputJson(
            wrapError(error instanceof Error ? error.message : String(error), {
              code: 'DELETE_DOC_ERROR',
            }),
            1
          );
        }
      })();
    }, 0);
    return () => clearTimeout(timer);
  }, [help.meta, jsonMode, options.config, path, options.confirm, options.permanent]);

  if (jsonMode) {
    return null;
  }

  if (!path) {
    return <Text>{help.text}</Text>;
  }

  // Normal Ink rendering
  const [output, setOutput] = useState<string>('Processing...');

  useEffect(() => {
    (async (): Promise<void> => {
      try {
        const configPath = resolveConfigPath(options.config);
        const config = loadConfig(configPath);
        const result = await deleteDoc(config, {
          path,
          confirm: options.confirm,
          permanent: options.permanent,
        });
        setOutput(result);
      } catch (error) {
        setOutput(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  }, [options.config, path, options.confirm, options.permanent]);

  return <Text>{output}</Text>;
}
