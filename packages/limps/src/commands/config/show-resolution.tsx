import { Text } from 'ink';
import { resolve } from 'path';
import { existsSync } from 'fs';
import zod from 'zod';

export const description = 'Show config resolution details (for debugging)';

export const options = zod.object({
  config: zod
    .string()
    .optional()
    .describe('Path to limps config file (takes priority over env var and local search)'),
});

interface Props {
  options: zod.infer<typeof options>;
}

/**
 * Walk up directory tree to find .limps/config.json
 */
function findLocalConfigs(startDir: string): string[] {
  const found: string[] = [];
  let currentDir = resolve(startDir);
  const root = resolve('/');

  while (currentDir !== root) {
    const configPath = resolve(currentDir, '.limps', 'config.json');
    if (existsSync(configPath)) {
      found.push(configPath);
    }
    currentDir = resolve(currentDir, '..');
  }

  // Check root directory as well
  const rootConfigPath = resolve(root, '.limps', 'config.json');
  if (existsSync(rootConfigPath)) {
    found.push(rootConfigPath);
  }

  return found;
}

export default function ConfigShowResolutionCommand({ options }: Props): React.ReactNode {
  const lines: string[] = [];
  const cwd = process.cwd();

  lines.push('Config Resolution Debug Info');
  lines.push('============================');
  lines.push('');
  lines.push(`Current working directory: ${cwd}`);
  lines.push('');

  // Priority 1: CLI argument
  lines.push('Priority 1: CLI --config argument');
  if (options.config) {
    const resolvedPath = resolve(options.config);
    const exists = existsSync(resolvedPath);
    lines.push(`  Provided: ${options.config}`);
    lines.push(`  Resolved: ${resolvedPath}`);
    lines.push(`  Exists: ${exists ? 'YES' : 'NO'}`);
    if (exists) {
      lines.push('  ✓ This config will be used');
    }
  } else {
    lines.push('  Not provided');
  }
  lines.push('');

  // Priority 2: Environment variable
  lines.push('Priority 2: MCP_PLANNING_CONFIG environment variable');
  const envConfigPath = process.env.MCP_PLANNING_CONFIG;
  if (envConfigPath) {
    const resolvedEnv = resolve(envConfigPath);
    const exists = existsSync(resolvedEnv);
    lines.push(`  Value: ${envConfigPath}`);
    lines.push(`  Resolved: ${resolvedEnv}`);
    lines.push(`  Exists: ${exists ? 'YES' : 'NO'}`);
    if (!options.config && exists) {
      lines.push('  ✓ This config will be used');
    }
  } else {
    lines.push('  Not set');
  }
  lines.push('');

  // Priority 3: Local search
  lines.push('Priority 3: Local .limps/config.json (search up from cwd)');
  const localConfigs = findLocalConfigs(cwd);
  if (localConfigs.length > 0) {
    lines.push(`  Found ${localConfigs.length} config(s) in parent directories:`);
    for (let i = 0; i < localConfigs.length; i++) {
      const marker = i === 0 && !options.config && !envConfigPath ? '  ✓ ' : '    ';
      lines.push(`${marker}${localConfigs[i]}`);
    }
    if (!options.config && !envConfigPath) {
      lines.push('  ✓ First config found will be used');
    }
  } else {
    lines.push('  No .limps/config.json found in current or parent directories');
  }
  lines.push('');

  // Summary
  lines.push('Summary');
  lines.push('-------');
  if (options.config) {
    lines.push(`Will use: CLI argument (${resolve(options.config)})`);
  } else if (envConfigPath) {
    lines.push(`Will use: MCP_PLANNING_CONFIG (${resolve(envConfigPath)})`);
  } else if (localConfigs.length > 0) {
    lines.push(`Will use: Local search (${localConfigs[0]})`);
  } else {
    lines.push('ERROR: No config found! Run `limps init` to create a project.');
  }

  return <Text>{lines.join('\n')}</Text>;
}
