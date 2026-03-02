import React from 'react';
import { Text, Box } from 'ink';
import { z } from 'zod';
import { join, dirname } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { Spec } from '../../documents/spec.js';
import { loadCommandContext } from '../../core/command-context.js';
import { isJsonMode, handleJsonOutput } from '../../cli/json-output.js';

export const description = 'Generate a spec document for a plan';

export const args = z.tuple([z.string().describe('Plan ID (e.g., "0001-feature-name")')]);

export const options = z.object({
  title: z.string().optional().describe('Spec title (defaults to plan ID)'),
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().default(false),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function GenSpec({ args: [planId], options: opts }: Props): React.JSX.Element {
  const { config } = loadCommandContext(opts.config);
  const title = opts.title ?? planId;

  const spec = new Spec({ title, planId });

  const specsPath = config.specsPath ?? join(dirname(config.plansPath), 'specs');
  const slug = title.toLowerCase().replace(/\s+/g, '-');
  const outputPath = join(specsPath, `${slug}.md`);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, spec.toMarkdown(), 'utf-8');

  if (isJsonMode(opts)) {
    handleJsonOutput(
      () => ({ id: spec.id, type: 'spec', title, planId, path: outputPath }),
      'GEN_SPEC_ERROR'
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="green">
        Created spec: <Text bold>{title}</Text>
      </Text>
      <Text dimColor>{outputPath}</Text>
    </Box>
  );
}
