/**
 * CLI command for analyzing components.
 */

import type { Command } from 'commander';
import { handleAnalyzeComponent } from '../../tools/analyze-component.js';

function printJson(text: string, json: boolean): void {
  if (json) {
    console.log(text);
    return;
  }

  const data = JSON.parse(text) as {
    component: string;
    filePath: string;
    recommendation: {
      primitive: string | null;
      package: string | null;
      confidence: number;
      action: string;
      reason: string;
    };
    isAmbiguous: boolean;
  };

  console.log(`${data.component} (${data.filePath})`);
  console.log(`Action: ${data.recommendation.action}`);
  console.log(`Confidence: ${data.recommendation.confidence}`);
  console.log(`Reason: ${data.recommendation.reason}`);
  if (data.isAmbiguous) {
    console.log('Ambiguous: true');
  }
}

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze')
    .description(
      'Analyze a React component for legacy Radix matches to inform Base UI migration (run from project dir; path is relative to cwd)'
    )
    .argument('<file>', 'Path to a .ts/.tsx component (relative to cwd)')
    .option('-v, --version <version>', 'Radix version to compare against', 'latest')
    .option('-t, --threshold <number>', 'Minimum confidence threshold', '40')
    .option('-p, --provider <provider>', 'Component library provider', 'radix')
    .option('--ruleset <ruleset>', 'Ruleset selection: base-ui, radix-legacy, or both', 'base-ui')
    .option('--evidence <level>', 'Evidence verbosity: summary or verbose', 'summary')
    .option('--json', 'Output raw JSON')
    .action(async (filePath, options) => {
      const response = await handleAnalyzeComponent({
        filePath,
        radixVersion: options.version,
        threshold: Number(options.threshold),
        provider: options.provider,
        ruleset: options.ruleset,
        evidence: options.evidence,
      });
      const text = response.content[0]?.text ?? '{}';
      printJson(text, Boolean(options.json));
    });
}
