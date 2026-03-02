import { Text, Box } from 'ink';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { loadCommandContext } from '../../core/command-context.js';
import { initializeDatabase, createSchema } from '../../indexer.js';
import { handleCreatePlan, CreatePlanInputSchema } from '../../tools/create-plan.js';
import type { ToolContext } from '../../types.js';
import { isJsonMode, outputJson, wrapSuccess, wrapError } from '../../cli/json-output.js';

export const description = 'Create a new plan with directory structure';

export const args = z.tuple([
  z
    .string()
    .min(CreatePlanInputSchema.shape.name.minLength ?? 1)
    .max(CreatePlanInputSchema.shape.name.maxLength ?? 100)
    .describe('Plan name'),
]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  description: z.string().optional().describe('Plan description'),
  body: z.string().optional().describe('Plan body content (markdown)'),
  template: z
    .enum(['default', 'spec'])
    .default('default')
    .describe('Plan template (default: minimal 3-section; spec: 12-section specification)'),
  json: z.boolean().default(false).describe('Output JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

interface CreateResult {
  plan: string;
  planDir: string;
  created?: boolean;
  alreadyExists?: boolean;
}

export default function CreatePlanCommand({ args, options }: Props): React.ReactNode {
  const [result, setResult] = useState<CreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async (): Promise<void> => {
      let db: ReturnType<typeof initializeDatabase> | null = null;
      try {
        const [name] = args;
        const { config } = loadCommandContext(options.config);
        mkdirSync(config.dataPath, { recursive: true });
        const dbPath = resolve(config.dataPath, 'documents.sqlite');
        db = initializeDatabase(dbPath);
        createSchema(db);

        const context: ToolContext = {
          db,
          config,
        };

        const toolResult = await handleCreatePlan(
          {
            name,
            description: options.description,
            body: options.body,
            templateName: options.template,
            ifExists: 'return',
          },
          context
        );

        if (toolResult.isError) {
          if (isJsonMode(options)) {
            outputJson(wrapError(toolResult.content[0].text, { code: 'CREATE_PLAN_FAILED' }), 1);
          }
          setError(toolResult.content[0].text);
          return;
        }

        const payload = JSON.parse(toolResult.content[0].text) as CreateResult;

        if (isJsonMode(options)) {
          outputJson(wrapSuccess(payload));
        }

        setResult(payload);
      } catch (err) {
        const message = (err as Error).message;
        if (isJsonMode(options)) {
          outputJson(wrapError(message, { code: 'CREATE_PLAN_FAILED' }), 1);
        }
        setError(message);
      } finally {
        if (db) {
          db.close();
        }
      }
    };

    void run();
  }, [args, options.body, options.config, options.description, options.json, options.template]);

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (!result) {
    return <Text>Creating plan...</Text>;
  }

  if (result.alreadyExists) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">
          Plan already exists: <Text bold>{result.plan}</Text>
        </Text>
        <Text dimColor>{result.planDir}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="green">
        Plan created: <Text bold>{result.plan}</Text>
      </Text>
      <Text dimColor>{result.planDir}</Text>
      {options.template === 'spec' && <Text dimColor>Template: 12-section specification</Text>}
    </Box>
  );
}
