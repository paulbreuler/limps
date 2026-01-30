/**
 * CLI entry point for limps-headless.
 */

import { Command } from 'commander';
import { registerAnalyzeCommand } from './commands/analyze.js';
import { registerAuditCommand } from './commands/audit.js';
import { registerCheckUpdatesCommand } from './commands/check-updates.js';
import { registerDiffCommand } from './commands/diff.js';
import { registerExtractCommand } from './commands/extract.js';
import { registerListCommand } from './commands/list.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function getPackageVersion(): string {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const packagePath = join(currentDir, '../../package.json');
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export async function runCli(): Promise<void> {
  const program = new Command();

  program
    .name('limps-headless')
    .description('Headless UI contract extraction and drift detection CLI')
    .version(getPackageVersion());

  registerListCommand(program);
  registerExtractCommand(program);
  registerAnalyzeCommand(program);
  registerAuditCommand(program);
  registerDiffCommand(program);
  registerCheckUpdatesCommand(program);

  await program.parseAsync(process.argv);
}

void runCli();
