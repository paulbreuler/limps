/**
 * CLI command for diffing Radix versions.
 */

import type { Command } from 'commander';
import { handleDiffVersions } from '../../tools/diff-versions.js';

function printJson(text: string, json: boolean): void {
  if (json) {
    console.log(text);
    return;
  }

  const data = JSON.parse(text) as {
    fromVersion: string;
    toVersion: string;
    hasBreakingChanges: boolean;
    summary: { totalChanges: number; breaking: number; warnings: number; info: number };
    changes: { description: string; severity: string }[];
  };

  console.log(`${data.fromVersion} → ${data.toVersion}`);
  console.log(`Breaking changes: ${data.hasBreakingChanges ? 'yes' : 'no'}`);
  console.log(
    `Summary: ${data.summary.totalChanges} total (${data.summary.breaking} breaking, ${data.summary.warnings} warnings, ${data.summary.info} info)`
  );
  console.log('');
  for (const change of data.changes) {
    console.log(`[${change.severity}] ${change.description}`);
  }
}

export function registerDiffCommand(program: Command): void {
  program
    .command('diff')
    .description('Diff two Radix versions')
    .argument('<from>', 'Starting version')
    .option('-t, --to <version>', 'Ending version', 'latest')
    .option('-p, --primitives <list>', 'Comma-separated primitives')
    .option('--breaking-only', 'Show only breaking changes')
    .option('--provider <provider>', 'Component library provider', 'radix')
    .option('--json', 'Output raw JSON')
    .action(async (fromVersion, options) => {
      const primitives = options.primitives
        ? String(options.primitives)
            .split(',')
            .map((p: string) => p.trim())
            .filter(Boolean)
        : undefined;
      const response = await handleDiffVersions({
        fromVersion,
        toVersion: options.to,
        primitives,
        breakingOnly: Boolean(options.breakingOnly),
        provider: options.provider,
      });
      const text = response.content[0]?.text ?? '{}';
      printJson(text, Boolean(options.json));
    });
}
