/**
 * Deprecation warning utilities.
 * Helps users migrate away from deprecated config options before v2.0.
 */

/**
 * Definition of a deprecated configuration option.
 */
export interface DeprecatedOption {
  /** The config key that is deprecated */
  key: string;
  /** Why this option is being deprecated */
  reason: string;
  /** Version when this option will be removed */
  removeVersion: string;
  /** Instructions for migrating away from this option */
  migration: string;
}

/**
 * List of deprecated configuration options.
 * These will be removed in v2.0.0.
 */
export const DEPRECATED_OPTIONS: DeprecatedOption[] = [
  {
    key: 'maxHandoffIterations',
    reason: 'Agent handoff system is being simplified',
    removeVersion: 'v2.0.0',
    migration: 'Remove this option from your config. Handoffs will use manual coordination.',
  },
  {
    key: 'debounceDelay',
    reason: 'Implementation detail that should not be user-configurable',
    removeVersion: 'v2.0.0',
    migration: 'Remove this option from your config. A sensible default (200ms) will be used.',
  },
];

/**
 * Check a configuration object for deprecated options.
 *
 * @param config - Configuration object to check
 * @returns Array of deprecated options that are present in the config
 */
export function checkDeprecations(config: Record<string, unknown>): DeprecatedOption[] {
  return DEPRECATED_OPTIONS.filter((option) => option.key in config);
}

/**
 * Format a deprecation warning for display.
 *
 * @param option - The deprecated option to format
 * @returns Human-readable warning string
 */
export function formatDeprecationWarning(option: DeprecatedOption): string {
  const lines = [
    `Deprecated config option: ${option.key}`,
    `  Reason: ${option.reason}`,
    `  Removal: ${option.removeVersion}`,
    `  Migration: ${option.migration}`,
  ];
  return lines.join('\n');
}

/**
 * Emit deprecation warnings to stderr.
 * Writes warnings for each deprecated option found.
 *
 * @param options - Array of deprecated options to warn about
 */
export function emitDeprecationWarnings(options: DeprecatedOption[]): void {
  if (options.length === 0) return;

  for (const option of options) {
    console.error(`\n⚠️  ${formatDeprecationWarning(option)}`);
  }
  console.error(''); // Empty line after warnings
}
