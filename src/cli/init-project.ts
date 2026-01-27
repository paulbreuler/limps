/**
 * Project initialization for limps CLI.
 */

import { resolve } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import which from 'which';
import { getOSConfigPath, getOSBasePath, getOSDataPath } from '../utils/os-paths.js';
import { registerProject } from './registry.js';

/**
 * Expand tilde in path to full home directory path.
 */
function expandTilde(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}

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
 * @param projectName - Name of the project (e.g., "runi-planning")
 * @param docsPath - Optional path to documentation directory
 * @returns Output message for the CLI
 */
export function initProject(projectName: string, docsPath?: string): string {
  const basePath = getOSBasePath(projectName);
  const configPath = getOSConfigPath(projectName);
  const dataPath = getOSDataPath(projectName);

  // Expand tilde in docsPath if provided
  const resolvedDocsPath = docsPath ? expandTilde(docsPath) : null;
  const defaultDocsPath = resolve(homedir(), 'Documents', projectName);

  // Create directory
  mkdirSync(basePath, { recursive: true });

  // Check if config already exists
  if (existsSync(configPath)) {
    throw new Error(
      `Config already exists at: ${configPath}\nTo reconfigure, delete the existing config file first.`
    );
  }

  // Create default config with absolute paths
  const config = {
    configVersion: 1,
    plansPath: resolvedDocsPath
      ? resolve(resolvedDocsPath, 'plans')
      : resolve(defaultDocsPath, 'plans'),
    docsPaths: [resolvedDocsPath || defaultDocsPath],
    fileExtensions: ['.md'],
    dataPath: dataPath,
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

  // Auto-register in the project registry
  registerProject(projectName, configPath);

  // Get the full path to limps executable
  const localPlannerPath = getLocalPlannerPath();

  const lines: string[] = [];
  lines.push(`\nCreated ${projectName} configuration\n`);
  lines.push(`Project "${projectName}" registered in limps.`);
  lines.push(`Run \`limps config use ${projectName}\` to set as default.\n`);
  lines.push(`Config: ${configPath}`);
  lines.push(`Data:   ${dataPath}`);
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

  // Test command
  lines.push('To test the server:');
  lines.push(`  ${localPlannerPath} --config "${configPath}"`);

  return lines.join('\n');
}
