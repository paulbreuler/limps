/**
 * CLI command for checking Radix updates.
 */

import type { Command } from 'commander';
import { handleCheckUpdates } from '../../tools/check-updates.js';

function printJson(text: string, json: boolean): void {
  if (json) {
    console.log(text);
    return;
  }

  const data = JSON.parse(text) as {
    currentVersion: string;
    latestVersion: string;
    hasUpdate: boolean;
    diff?: { summary: { totalChanges: number } };
  };

  console.log(`Current: ${data.currentVersion}`);
  console.log(`Latest:  ${data.latestVersion}`);
  console.log(`Update:  ${data.hasUpdate ? 'available' : 'none'}`);
  if (data.diff) {
    console.log(`Changes: ${data.diff.summary.totalChanges} total`);
  }
}

export function registerCheckUpdatesCommand(program: Command): void {
  program
    .command('check-updates')
    .description('Check for new Radix releases')
    .option('--refresh', 'Refresh cached data')
    .option('-p, --provider <provider>', 'Component library provider', 'radix')
    .option('--json', 'Output raw JSON')
    .action(async (options) => {
      const response = await handleCheckUpdates({
        refreshCache: Boolean(options.refresh),
        provider: options.provider,
      });
      const text = response.content[0]?.text ?? '{}';
      printJson(text, Boolean(options.json));
    });
}
