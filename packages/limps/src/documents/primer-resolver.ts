import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface PrimerResult {
  content: string;
  path: string;
  source: 'override' | 'plan' | 'config';
}

export function resolvePrimer(
  planDir: string,
  config: { primerPath?: string },
  overridePath?: string
): PrimerResult | null {
  // 1. Override path flag
  if (overridePath && existsSync(overridePath)) {
    return {
      content: readFileSync(overridePath, 'utf-8'),
      path: overridePath,
      source: 'override',
    };
  }

  // 2. Plan-local PRIMER.md
  const planPrimer = join(planDir, 'PRIMER.md');
  if (existsSync(planPrimer)) {
    return {
      content: readFileSync(planPrimer, 'utf-8'),
      path: planPrimer,
      source: 'plan',
    };
  }

  // 3. Global config primerPath
  if (config.primerPath && existsSync(config.primerPath)) {
    return {
      content: readFileSync(config.primerPath, 'utf-8'),
      path: config.primerPath,
      source: 'config',
    };
  }

  return null;
}
