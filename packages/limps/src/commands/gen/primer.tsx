import React from 'react';
import { Text, Box } from 'ink';
import { z } from 'zod';
import { join } from 'path';
import { existsSync, writeFileSync } from 'fs';
import { loadCommandContext } from '../../core/command-context.js';
import { isJsonMode, handleJsonOutput, JSON_OPTION } from '../../cli/json-output.js';

export const description = 'Create or update a plan PRIMER.md file';

export const args = z.tuple([z.string().describe('Plan ID (e.g., "0001-feature-name")')]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  json: JSON_OPTION,
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

const DEFAULT_PRIMER = `# Primer

## Project Context

<!-- Provide essential context that every agent working on this plan needs -->

## Conventions

<!-- Coding standards, naming conventions, patterns to follow -->

## Key Files

<!-- List critical files and their purposes -->

## Testing Requirements

<!-- Testing standards and patterns -->
`;

export default function GenPrimer({ args: [planId], options: opts }: Props): React.JSX.Element {
  const { config } = loadCommandContext(opts.config);
  const plansPath = config.workspacePath ?? config.plansPath;
  const planDir = join(plansPath, planId);
  const primerPath = join(planDir, 'PRIMER.md');

  const alreadyExists = existsSync(primerPath);

  if (!alreadyExists) {
    writeFileSync(primerPath, DEFAULT_PRIMER, 'utf-8');
  }

  if (isJsonMode(opts)) {
    handleJsonOutput(
      () => ({
        planId,
        path: primerPath,
        created: !alreadyExists,
        alreadyExists,
      }),
      'GEN_PRIMER_ERROR'
    );
  }

  if (alreadyExists) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">
          Primer already exists: <Text bold>{primerPath}</Text>
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="green">
        Created primer: <Text bold>{primerPath}</Text>
      </Text>
    </Box>
  );
}
