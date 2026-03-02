import React from 'react';
import { Text, Box } from 'ink';
import { z } from 'zod';
import { join, dirname } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { Journey } from '../../documents/journey.js';
import { loadCommandContext } from '../../core/command-context.js';
import { isJsonMode, handleJsonOutput } from '../../cli/json-output.js';

export const description = 'Create a user journey document';

export const args = z.tuple([z.string().describe('Name of the journey')]);

export const options = z.object({
  persona: z.string().optional().describe('Path to persona file'),
  description: z.string().optional().describe('Journey scenario description'),
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().default(false),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function GenJourney({ args: [name], options: opts }: Props): React.JSX.Element {
  const { config } = loadCommandContext(opts.config);
  const journey = new Journey({
    title: name,
    personaPath: opts.persona,
    description: opts.description,
  });

  const journeysPath = config.journeysPath ?? join(dirname(config.plansPath), 'journeys');
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const outputPath = join(journeysPath, `${slug}.md`);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, journey.toMarkdown(), 'utf-8');

  if (isJsonMode(opts)) {
    handleJsonOutput(
      () => ({ id: journey.id, type: 'journey', title: name, path: outputPath }),
      'GEN_JOURNEY_ERROR'
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="green">
        Created journey: <Text bold>{name}</Text>
      </Text>
      <Text dimColor>{outputPath}</Text>
    </Box>
  );
}
