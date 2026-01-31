/**
 * CLI command for extracting primitive contracts.
 */

import type { Command } from 'commander';
import { handleExtractPrimitive } from '../../tools/extract-primitive.js';

function printJson(text: string, json: boolean): void {
  if (json) {
    console.log(text);
    return;
  }

  const data = JSON.parse(text) as {
    primitive: string;
    package: string;
    version: string;
    behavior: {
      statePattern: string;
      compositionPattern: string;
      renderingPattern: string;
    };
    subComponents: { name: string; props: { name: string; type: string }[] }[];
  };

  console.log(`${data.primitive} (${data.package}) @ ${data.version}`);
  console.log(`State: ${data.behavior.statePattern}`);
  console.log(`Composition: ${data.behavior.compositionPattern}`);
  console.log(`Rendering: ${data.behavior.renderingPattern}`);
  console.log('');
  console.log('Sub-components:');
  for (const sub of data.subComponents) {
    console.log(`- ${sub.name}`);
    for (const prop of sub.props) {
      console.log(`  - ${prop.name}: ${prop.type}`);
    }
  }
}

export function registerExtractCommand(program: Command): void {
  program
    .command('extract')
    .description('Extract a primitive contract')
    .argument('<primitive>', 'Primitive name (e.g., dialog)')
    .option('-v, --version <version>', 'Version to query', 'latest')
    .option('-p, --provider <provider>', 'Component library provider', 'radix')
    .option('--json', 'Output raw JSON')
    .action(async (primitive, options) => {
      const response = await handleExtractPrimitive({
        primitive,
        version: options.version,
        provider: options.provider,
      });
      const text = response.content[0]?.text ?? '{}';
      printJson(text, Boolean(options.json));
    });
}
