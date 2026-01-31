/**
 * Config and defaults for limps-headless (Agent 0).
 * Merges with limps root config when used as extension; used as defaults for standalone CLI.
 */

import type { RunAuditOptions } from './audit/types.js';
import { DEFAULT_RUN_AUDIT_OPTIONS } from './cli/flags.js';

export interface HeadlessConfig {
  /** Base directory for cache (e.g. ~/.limps-headless) */
  cacheDir?: string;
  /** Policy options for audit */
  audit?: Partial<RunAuditOptions>;
}

const DEFAULTS: HeadlessConfig = {
  audit: DEFAULT_RUN_AUDIT_OPTIONS,
};

/**
 * Resolve headless config: merge optional file/config with defaults.
 * Does not read from disk; callers pass in parsed config if needed.
 */
export function resolveHeadlessConfig(overrides?: HeadlessConfig | null): HeadlessConfig {
  if (!overrides) return { ...DEFAULTS };
  return {
    ...DEFAULTS,
    ...overrides,
    audit: { ...DEFAULTS.audit, ...overrides.audit },
  };
}

export { DEFAULT_RUN_AUDIT_OPTIONS } from './cli/flags.js';
export type { RunAuditOptions } from './audit/types.js';
