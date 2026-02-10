import { Text } from 'ink';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { createDoc, getCreateDocData } from '../cli/docs-create.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { buildHelpOutput } from '../utils/cli-help.js';
import { handleJsonOutput, isJsonMode, outputJson, wrapError } from '../cli/json-output.js';

export const description = 'Create a new document';

export const args = z.tuple([z.string().describe('document path')]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  template: z
    .enum(['addendum', 'research', 'example', 'none'])
    .optional()
    .describe('Template to apply'),
  content: z.string().optional().describe('Document content'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function CreateDocCommand({ args, options }: Props): React.ReactNode {
  const [path] = args;
  const help = buildHelpOutput({
    usage: 'limps create-doc <path> [options]',
    arguments: ['path Path for new document (relative to repo root)'],
    options: [
      '--config Path to config file',
      '--template Template to apply (addendum|research|example|none)',
      '--content Document content',
      '--json Output as JSON',
    ],
    examples: [
      'limps create-doc "research/notes.md" --content "# Notes"',
      'limps create-doc "addendum.md" --template addendum --content "Details..."',
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

          const result = await getCreateDocData(config, {
            path,
            content: options.content || '',
            template: options.template,
          });

          handleJsonOutput(() => {
            if ('error' in result) {
              throw new Error(result.error);
            }
            return result;
          }, 'CREATE_DOC_ERROR');
        } catch (error) {
          outputJson(
            wrapError(error instanceof Error ? error.message : String(error), {
              code: 'CREATE_DOC_ERROR',
            }),
            1
          );
        }
      })();
    }, 0);
    return () => clearTimeout(timer);
  }, [help.meta, jsonMode, options.config, path, options.content, options.template]);

  if (jsonMode) {
    return null;
  }

  if (!path) {
    return <Text>{help.text}</Text>;
  }

  // Normal Ink rendering
  const [output, setOutput] = useState<string>('Creating document...');

  useEffect(() => {
    (async (): Promise<void> => {
      try {
        const configPath = resolveConfigPath(options.config);
        const config = loadConfig(configPath);
        const result = await createDoc(config, {
          path,
          content: options.content || '',
          template: options.template,
        });
        setOutput(result);
      } catch (error) {
        setOutput(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  }, [options.config, path, options.content, options.template]);

  return <Text>{output}</Text>;
}
