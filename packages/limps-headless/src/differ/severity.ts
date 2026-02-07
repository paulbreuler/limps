/**
 * Severity classification for contract changes.
 */

import type { ChangeType, ChangeSeverity } from './types.js';

/**
 * Map change types to their severity levels.
 */
const SEVERITY_MAP: Record<ChangeType, ChangeSeverity> = {
  // Breaking changes - will break existing code
  prop_removed: 'breaking',
  prop_required: 'breaking',
  subcomponent_removed: 'breaking',
  type_narrowed: 'breaking',

  // Warning changes - might cause issues
  prop_deprecated: 'warning',
  type_changed: 'warning',
  default_changed: 'warning',

  // Info changes - additive, safe
  prop_added: 'info',
  subcomponent_added: 'info',
  type_widened: 'info',
};

/**
 * Get the severity level for a change type.
 */
export function getSeverity(changeType: ChangeType): ChangeSeverity {
  return SEVERITY_MAP[changeType];
}

/**
 * Check if a change type is breaking.
 */
export function isBreaking(changeType: ChangeType): boolean {
  return SEVERITY_MAP[changeType] === 'breaking';
}

/**
 * Check if a change type is a warning.
 */
export function isWarning(changeType: ChangeType): boolean {
  return SEVERITY_MAP[changeType] === 'warning';
}

/**
 * Check if a change type is informational.
 */
export function isInfo(changeType: ChangeType): boolean {
  return SEVERITY_MAP[changeType] === 'info';
}

/**
 * Get all breaking change types.
 */
export function getBreakingTypes(): ChangeType[] {
  return Object.entries(SEVERITY_MAP)
    .filter(([, severity]) => severity === 'breaking')
    .map(([type]) => type as ChangeType);
}

/**
 * Sort changes by severity (breaking first, then warning, then info).
 */
export function sortBySeverity<T extends { severity: ChangeSeverity }>(changes: T[]): T[] {
  const severityOrder: Record<ChangeSeverity, number> = {
    breaking: 0,
    warning: 1,
    info: 2,
  };

  return [...changes].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
