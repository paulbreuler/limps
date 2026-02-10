import React, { useEffect, useState } from 'react';
import { Text, Box } from 'ink';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { buildHelpOutput } from '../utils/cli-help.js';
import { handleJsonOutput, isJsonMode, outputJson, wrapError } from '../cli/json-output.js';
import {
  handleProcessDoc,
  type ProcessDocOutput,
  ProcessDocInputSchema,
} from '../tools/process-doc.js';
import {
  handleProcessDocs,
  type ProcessDocsOutput,
  ProcessDocsInputSchema,
} from '../tools/process-docs.js';
import { initializeDatabase, createSchema } from '../indexer.js';
import { join } from 'path';
import { mkdirSync } from 'fs';
import type { ToolContext } from '../types.js';

export const description = 'Process document(s) with JavaScript code';

export const args = z.tuple([z.string().describe('Document path').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  pattern: z
    .string()
    .optional()
    .describe('Glob pattern for multiple documents (e.g., "plans/*/*-plan.md")'),
  code: z.string().describe('JavaScript code to execute'),
  json: z.boolean().optional().describe('Output as JSON'),
  timeout: z.number().optional().describe('Execution timeout in milliseconds (default: 5000)'),
  'max-docs': z.number().optional().describe('Maximum documents to load (default: 20)'),
  pretty: z.boolean().optional().describe('Pretty-print JSON output'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function ProcessCommand({ args, options }: Props): React.ReactNode {
  const [path] = args;
  const [result, setResult] = useState<ProcessDocOutput | ProcessDocsOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const help = buildHelpOutput({
    usage: 'limps process <path> | limps process --pattern <glob> --code <code> [options]',
    arguments: ['path Optional document path (mutually exclusive with --pattern)'],
    options: [
      '--config Path to config file',
      '--pattern Glob pattern for multiple documents',
      '--code JavaScript code to execute (required)',
      '--json Output as JSON',
      '--timeout Execution timeout in milliseconds (default: 5000)',
      '--max-docs Maximum documents to load (default: 20)',
      '--pretty Pretty-print JSON output',
    ],
    sections: [
      {
        title: 'Single Document Examples',
        lines: [
          'limps process plans/0001-feature/plan.md --code "doc.content.length"',
          'limps process plan.md --code "extractFrontmatter(doc.content).meta.name"',
        ],
      },
      {
        title: 'Multiple Documents Examples',
        lines: [
          'limps process --pattern "plans/*/*-plan.md" --code "docs.length"',
          'limps process --pattern "**/*.md" --code "docs.map(d => d.path)"',
        ],
      },
    ],
  });

  const jsonMode = isJsonMode(options);

  useEffect((): (() => void) | undefined => {
    if (!jsonMode) {
      return undefined;
    }

    const timer = setTimeout(() => {
      try {
        // Validation: must provide either path or pattern
        if (!path && !options.pattern) {
          outputJson(
            wrapError('Either path argument or --pattern option is required', {
              code: 'MISSING_INPUT',
              help: help.meta,
            }),
            1
          );
          return;
        }

        // Validation: cannot provide both
        if (path && options.pattern) {
          outputJson(
            wrapError('Cannot provide both path argument and --pattern option', {
              code: 'CONFLICTING_INPUT',
              help: help.meta,
            }),
            1
          );
          return;
        }

        // Validation: code is required
        if (!options.code) {
          outputJson(
            wrapError('--code option is required', {
              code: 'MISSING_CODE',
              help: help.meta,
            }),
            1
          );
          return;
        }

        const configPath = resolveConfigPath(options.config);
        const config = loadConfig(configPath);

        // Initialize database
        mkdirSync(config.dataPath, { recursive: true });
        const dbPath = join(config.dataPath, 'documents.sqlite');
        const db = initializeDatabase(dbPath);
        createSchema(db);

        const context: ToolContext = { db, config };

        if (path) {
          // Single document processing
          handleJsonOutput(async () => {
            const input = ProcessDocInputSchema.parse({
              path,
              code: options.code,
              ...(options.timeout !== undefined && { timeout: options.timeout }),
              prettyPrint: options.pretty ?? false,
            });

            const toolResult = await handleProcessDoc(input, context);

            if (toolResult.isError) {
              throw new Error(toolResult.content[0].text);
            }

            const output = JSON.parse(toolResult.content[0].text);
            db.close();
            return output;
          }, 'PROCESS_DOC_ERROR');
        } else if (options.pattern) {
          // Multiple documents processing
          handleJsonOutput(async () => {
            const input = ProcessDocsInputSchema.parse({
              pattern: options.pattern,
              code: options.code,
              ...(options.timeout !== undefined && { timeout: options.timeout }),
              ...(options['max-docs'] !== undefined && { max_docs: options['max-docs'] }),
            });

            const toolResult = await handleProcessDocs(input, context);

            if (toolResult.isError) {
              throw new Error(toolResult.content[0].text);
            }

            const output = JSON.parse(toolResult.content[0].text);
            db.close();
            return output;
          }, 'PROCESS_DOCS_ERROR');
        }
      } catch (err) {
        outputJson(
          wrapError(err instanceof Error ? err.message : String(err), {
            code: 'PROCESS_ERROR',
          }),
          1
        );
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [jsonMode, path, options, help.meta]);

  useEffect((): (() => void) | undefined => {
    if (jsonMode) {
      return undefined;
    }

    const run = async (): Promise<void> => {
      let db: ReturnType<typeof initializeDatabase> | null = null;
      try {
        // Validation: must provide either path or pattern
        if (!path && !options.pattern) {
          setError('Either path argument or --pattern option is required');
          return;
        }

        // Validation: cannot provide both
        if (path && options.pattern) {
          setError('Cannot provide both path argument and --pattern option');
          return;
        }

        // Validation: code is required
        if (!options.code) {
          setError('--code option is required');
          return;
        }

        const configPath = resolveConfigPath(options.config);
        const config = loadConfig(configPath);

        // Initialize database
        mkdirSync(config.dataPath, { recursive: true });
        const dbPath = join(config.dataPath, 'documents.sqlite');
        db = initializeDatabase(dbPath);
        createSchema(db);

        const context: ToolContext = { db, config };

        if (path) {
          // Single document processing
          const input = ProcessDocInputSchema.parse({
            path,
            code: options.code,
            ...(options.timeout !== undefined && { timeout: options.timeout }),
            prettyPrint: options.pretty ?? false,
          });

          const toolResult = await handleProcessDoc(input, context);

          if (toolResult.isError) {
            setError(toolResult.content[0].text);
            return;
          }

          const output = JSON.parse(toolResult.content[0].text) as ProcessDocOutput;
          setResult(output);
        } else if (options.pattern) {
          // Multiple documents processing
          const input = ProcessDocsInputSchema.parse({
            pattern: options.pattern,
            code: options.code,
            ...(options.timeout !== undefined && { timeout: options.timeout }),
            ...(options['max-docs'] !== undefined && { max_docs: options['max-docs'] }),
          });

          const toolResult = await handleProcessDocs(input, context);

          if (toolResult.isError) {
            setError(toolResult.content[0].text);
            return;
          }

          const output = JSON.parse(toolResult.content[0].text) as ProcessDocsOutput;
          setResult(output);
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
    return undefined;
  }, [path, options, jsonMode]);

  if (jsonMode) {
    return null;
  }

  if (!options.code) {
    return <Text>{help.text}</Text>;
  }

  if (!path && !options.pattern) {
    return <Text>{help.text}</Text>;
  }

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (!result) {
    return <Text>Processing...</Text>;
  }

  // Display result based on type
  if ('docs_loaded' in result) {
    // ProcessDocsOutput
    return (
      <Box flexDirection="column">
        <Text color="green">✓ Processed {result.docs_loaded} documents</Text>
        <Text dimColor>Execution time: {result.execution_time_ms}ms</Text>
        <Text>{'\n'}Result:</Text>
        <Text>{JSON.stringify(result.result, null, options.pretty ? 2 : undefined)}</Text>
      </Box>
    );
  } else {
    // ProcessDocOutput
    return (
      <Box flexDirection="column">
        <Text color="green">✓ Processed document: {result.metadata.path}</Text>
        <Text dimColor>
          Execution time: {result.execution_time_ms}ms
          {result.tokens_saved ? ` | Tokens saved: ~${result.tokens_saved}` : ''}
        </Text>
        <Text>{'\n'}Result:</Text>
        <Text>{JSON.stringify(result.result, null, options.pretty ? 2 : undefined)}</Text>
      </Box>
    );
  }
}
