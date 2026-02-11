/**
 * Project initialization for limps CLI.
 * Creates a local .limps/ directory alongside the project docs.
 */

import { resolve, basename } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import which from 'which';

/**
 * Get the full path to the limps executable.
 * Falls back to 'limps' if not found in PATH.
 */
function getLocalPlannerPath(): string {
  try {
    return which.sync('limps');
  } catch {
    return 'limps';
  }
}

/**
 * Initialize a new project configuration.
 *
 * Creates `<targetPath>/.limps/config.json` and `<targetPath>/.limps/data/`.
 * The plansPath is set to `<targetPath>/plans` if it exists, otherwise `<targetPath>`.
 * The docsPaths is set to `[<targetPath>]`.
 *
 * @param targetPath - Directory to initialize (defaults to ".")
 * @returns Output message for the CLI
 */
export function initProject(targetPath = '.'): string {
  const resolvedPath = resolve(targetPath);
  const limpsDir = resolve(resolvedPath, '.limps');
  const configPath = resolve(limpsDir, 'config.json');
  const dataPath = resolve(limpsDir, 'data');

  // Check if config already exists
  if (existsSync(configPath)) {
    throw new Error(
      `Config already exists at: ${configPath}\nTo reconfigure, delete the existing config file first.`
    );
  }

  // Create .limps/data directory
  mkdirSync(dataPath, { recursive: true });

  // Determine plansPath: use <path>/plans if it exists, otherwise <path>
  const plansCandidate = resolve(resolvedPath, 'plans');
  const plansPath = existsSync(plansCandidate) ? plansCandidate : resolvedPath;

  // Create default config with absolute paths
  const config = {
    configVersion: 1,
    plansPath,
    docsPaths: [resolvedPath],
    fileExtensions: ['.md'],
    dataPath,
    scoring: {
      weights: {
        dependency: 40,
        priority: 30,
        workload: 30,
      },
      biases: {},
    },
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Get the full path to limps executable
  const localPlannerPath = getLocalPlannerPath();
  const projectName = basename(resolvedPath) || 'limps';

  const lines: string[] = [];
  lines.push(`\nInitialized limps in ${limpsDir}\n`);
  lines.push(`Config: ${configPath}`);
  lines.push(`Data:   ${dataPath}`);
  lines.push(`Plans:  ${plansPath}`);
  lines.push('');

  // Start the HTTP daemon
  lines.push('Next steps:\n');
  lines.push('1. Start the HTTP daemon:');
  lines.push(`   ${localPlannerPath} start --config "${configPath}"`);
  lines.push('');
  lines.push('2. Generate MCP client config:');
  lines.push(`   ${localPlannerPath} config print --client claude-code --config "${configPath}"`);
  lines.push('');
  lines.push('3. Add the generated config to your MCP client');
  lines.push('');

  // HTTP transport config example
  lines.push('Example MCP client configuration:\n');
  lines.push(
    JSON.stringify(
      {
        mcpServers: {
          [projectName]: {
            transport: { type: 'http', url: 'http://127.0.0.1:4269/mcp' },
          },
        },
      },
      null,
      2
    )
  );
  lines.push('');

  // Daemon management
  lines.push('Manage the daemon:');
  lines.push(`  ${localPlannerPath} server status --config "${configPath}"  # Check status`);
  lines.push(`  ${localPlannerPath} server stop --config "${configPath}"    # Stop daemon`);
  lines.push('');

  // CLI usage
  lines.push('Use --config for CLI commands:');
  lines.push(`  ${localPlannerPath} plan list --config "${configPath}"`);

  return lines.join('\n');
}
