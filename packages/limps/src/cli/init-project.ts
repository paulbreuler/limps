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

  // Usage hint
  lines.push('Use --config to pass the config path to limps commands:\n');
  lines.push(`  ${localPlannerPath} list-plans --config "${configPath}"`);
  lines.push('');

  // Cursor settings snippet
  lines.push(
    'Add this to your Cursor settings (Cmd+Shift+P → "Preferences: Open User Settings (JSON)"):\n'
  );
  lines.push(
    JSON.stringify(
      {
        'mcp.servers': {
          [projectName]: {
            command: localPlannerPath,
            args: ['--config', configPath],
          },
        },
      },
      null,
      2
    )
  );
  lines.push('');

  // Claude Desktop config snippet
  lines.push(
    'For Claude Desktop, add this to ~/Library/Application Support/Claude/claude_desktop_config.json:\n'
  );
  lines.push(
    JSON.stringify(
      {
        mcpServers: {
          [projectName]: {
            command: 'npx',
            args: ['-y', '@sudosandwich/limps', '--config', configPath],
          },
        },
      },
      null,
      2
    )
  );
  lines.push('');

  // HTTP transport alternative
  lines.push('--- HTTP Transport (alternative) ---\n');
  lines.push('Start the persistent HTTP server:');
  lines.push(`  ${localPlannerPath} start --config "${configPath}"\n`);
  lines.push('Then configure your MCP client to use HTTP transport:\n');
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
  lines.push('Manage the daemon:');
  lines.push(`  ${localPlannerPath} status-server --config "${configPath}"  # Check if running`);
  lines.push(`  ${localPlannerPath} stop --config "${configPath}"            # Stop the daemon`);
  lines.push('');

  // Test command
  lines.push('To test the server (stdio):');
  lines.push(`  ${localPlannerPath} serve --config "${configPath}"`);

  return lines.join('\n');
}
