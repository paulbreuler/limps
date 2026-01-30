/**
 * CLI command for listing primitives.
 */

import type { Command } from 'commander';
import { handleListPrimitives } from '../../tools/list-primitives.js';

function printJson(text: string, json: boolean): void {
  if (json) {
    console.log(text);
    return;
  }

  const data = JSON.parse(text) as {
    version: string;
    primitives: { name: string; package: string; description?: string }[];
  };

  console.log(`Version: ${data.version}`);
  for (const primitive of data.primitives) {
    const description = primitive.description ? ` - ${primitive.description}` : '';
    console.log(`- ${primitive.name} (${primitive.package})${description}`);
  }
}

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List available primitives')
    .option('-v, --version <version>', 'Version to query', 'latest')
    .option('-p, --provider <provider>', 'Component library provider', 'radix')
    .option('--json', 'Output raw JSON')
    .action(async (options) => {
      const response = await handleListPrimitives({
        version: options.version,
        provider: options.provider,
      });
      const text = response.content[0]?.text ?? '{}';
      printJson(text, Boolean(options.json));
    });
}
