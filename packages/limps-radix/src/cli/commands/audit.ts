/**
 * CLI command for running a full Radix audit (analysis + diff + report).
 */

import type { Command } from 'commander';
import { runAudit } from '../../audit/run-audit.js';

export function registerAuditCommand(program: Command): void {
  program
    .command('audit')
    .description(
      'Run full audit: optionally analyze files, diff versions, check updates; writes report to .limps-radix/reports (run from project dir)'
    )
    .option(
      '-f, --files <paths...>',
      'Component file paths to analyze (relative to cwd)'
    )
    .option('-o, --output-dir <dir>', 'Output directory', '.limps-radix/reports')
    .option(
      '--format <format>',
      'Report format: json, markdown, or both',
      'both'
    )
    .option('--json', 'Output summary as JSON only')
    .action(async (options) => {
      const files = options.files
        ? (Array.isArray(options.files) ? options.files : [options.files]).flat()
        : [];
      const result = await runAudit({
        scope: files.length > 0 ? { files } : undefined,
        outputDir: options.outputDir,
        format: options.format === 'json' ? 'json' : options.format === 'markdown' ? 'markdown' : 'both',
      });

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              outputDir: result.outputDir,
              jsonPath: result.jsonPath,
              markdownPath: result.markdownPath,
              analysisPath: result.analysisPath,
              diffPath: result.diffPath,
              updatesPath: result.updatesPath,
              summary: result.report.summary,
            },
            null,
            2
          )
        );
        return;
      }

      console.log('Audit complete.');
      console.log(`Output dir:  ${result.outputDir}`);
      if (result.markdownPath) {
        console.log(`Report:      ${result.markdownPath}`);
      }
      if (result.jsonPath) {
        console.log(`JSON:        ${result.jsonPath}`);
      }
      console.log(`Analysis:    ${result.analysisPath}`);
      console.log(`Diff:        ${result.diffPath}`);
      console.log(`Updates:     ${result.updatesPath}`);
      console.log('');
      const s = result.report.summary;
      console.log(
        `Summary: ${s.totalComponents} components, ${s.contraventions} contraventions, issues: ${s.issuesByPriority.critical ?? 0} critical / ${s.issuesByPriority.high ?? 0} high / ${s.issuesByPriority.medium ?? 0} medium / ${s.issuesByPriority.low ?? 0} low`
      );
    });
}
