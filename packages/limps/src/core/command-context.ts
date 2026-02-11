import { loadConfig, type ServerConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';

export interface CommandContext {
  configPath: string;
  config: ServerConfig;
}

export function loadCommandContext(configOption?: string): CommandContext {
  const configPath = resolveConfigPath(configOption);
  const config = loadConfig(configPath);
  return { configPath, config };
}
