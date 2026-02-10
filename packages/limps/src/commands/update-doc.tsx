import { Text } from 'ink';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { updateDoc, getUpdateDocData } from '../cli/docs-update.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { buildHelpOutput } from '../utils/cli-help.js';
import { handleJsonOutput, isJsonMode, outputJson, wrapError } from '../cli/json-output.js';

export const description = 'Update an existing document';

export const args = z.tuple([z.string().describe('document path')]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  mode: z
    .enum(['overwrite', 'append', 'prepend'])
    .optional()
    .describe('Update mode (default: overwrite)'),
  content: z.string().optional().describe('Content to write'),
  patch: z.string().optional().describe('Search and replace (format: "search:::replace")'),
  noBackup: z.boolean().optional().describe('Skip backup creation'),
  force: z.boolean().optional().describe('Skip validation warnings'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function UpdateDocCommand({ args, options }: Props): React.ReactNode {
  const [path] = args;
  const help = buildHelpOutput({
    usage: 'limps update-doc <path> [options]',
    arguments: ['path Path to existing document'],
    options: [
      '--config Path to config file',
      '--mode Update mode (overwrite|append|prepend)',
      '--content Content to write',
      '--patch Search and replace (format: "search:::replace")',
      '--no-backup Skip backup creation',
      '--force Skip validation warnings',
      '--json Output as JSON',
    ],
    examples: [
      'limps update-doc "notes.md" --content "New content" --mode overwrite',
      'limps update-doc "notes.md" --content "More notes" --mode append',
      'limps update-doc "notes.md" --patch "old text:::new text"',
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

          let patchObj: { search: string; replace: string } | undefined;
          if (options.patch) {
            const parts = options.patch.split(':::');
            if (parts.length === 2) {
              patchObj = { search: parts[0], replace: parts[1] };
            }
          }

          const result = await getUpdateDocData(config, {
            path,
            content: options.content,
            mode: options.mode,
            patch: patchObj,
            createBackup: !options.noBackup,
            force: options.force,
          });

          handleJsonOutput(() => {
            if ('error' in result) {
              throw new Error(result.error);
            }
            return result;
          }, 'UPDATE_DOC_ERROR');
        } catch (error) {
          outputJson(
            wrapError(error instanceof Error ? error.message : String(error), {
              code: 'UPDATE_DOC_ERROR',
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
    path,
    options.content,
    options.mode,
    options.patch,
    options.noBackup,
    options.force,
  ]);

  if (jsonMode) {
    return null;
  }

  if (!path) {
    return <Text>{help.text}</Text>;
  }

  // Normal Ink rendering
  const [output, setOutput] = useState<string>('Updating document...');

  useEffect(() => {
    (async (): Promise<void> => {
      try {
        const configPath = resolveConfigPath(options.config);
        const config = loadConfig(configPath);

        let patchObj: { search: string; replace: string } | undefined;
        if (options.patch) {
          const parts = options.patch.split(':::');
          if (parts.length === 2) {
            patchObj = { search: parts[0], replace: parts[1] };
          }
        }

        const result = await updateDoc(config, {
          path,
          content: options.content,
          mode: options.mode,
          patch: patchObj,
          createBackup: !options.noBackup,
          force: options.force,
        });
        setOutput(result);
      } catch (error) {
        setOutput(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  }, [
    options.config,
    path,
    options.content,
    options.mode,
    options.patch,
    options.noBackup,
    options.force,
  ]);

  return <Text>{output}</Text>;
}
