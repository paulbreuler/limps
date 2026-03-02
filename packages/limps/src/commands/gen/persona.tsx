import React from 'react';
import { Text, Box } from 'ink';
import { z } from 'zod';
import { join, dirname } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { Persona } from '../../documents/persona.js';
import { loadCommandContext } from '../../core/command-context.js';
import { isJsonMode, handleJsonOutput } from '../../cli/json-output.js';

export const description = 'Create a persona document';

export const args = z.tuple([z.string().describe('Name of the persona')]);

export const options = z.object({
  description: z.string().optional().describe('Persona description'),
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().default(false),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function GenPersona({ args: [name], options: opts }: Props): React.JSX.Element {
  const { config } = loadCommandContext(opts.config);
  const persona = new Persona(name, opts.description ?? '');

  const personasPath = config.personasPath ?? join(dirname(config.plansPath), 'personas');
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const outputPath = join(personasPath, `${slug}.md`);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, persona.toMarkdown(), 'utf-8');

  if (isJsonMode(opts)) {
    handleJsonOutput(
      () => ({ id: persona.id, type: 'persona', title: name, path: outputPath }),
      'GEN_PERSONA_ERROR'
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="green">
        Created persona: <Text bold>{name}</Text>
      </Text>
      <Text dimColor>{outputPath}</Text>
    </Box>
  );
}
