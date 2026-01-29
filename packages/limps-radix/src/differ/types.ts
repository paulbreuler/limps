/**
 * Type definitions for the Radix contract differ.
 */

/**
 * Severity levels for contract changes.
 */
export type ChangeSeverity = 'breaking' | 'warning' | 'info';

/**
 * Types of changes that can occur in a contract.
 */
export type ChangeType =
  // Breaking changes
  | 'prop_removed'
  | 'prop_required' // was optional, now required
  | 'subcomponent_removed'
  | 'type_narrowed' // union became smaller

  // Warning changes
  | 'prop_deprecated'
  | 'type_changed' // type changed but not narrowing/widening
  | 'default_changed'

  // Info changes (additive, safe)
  | 'prop_added'
  | 'subcomponent_added'
  | 'type_widened'; // union became larger

/**
 * A single change detected between two contract versions.
 */
export interface RadixChange {
  /**
   * The type of change detected.
   */
  type: ChangeType;

  /**
   * Severity classification of the change.
   */
  severity: ChangeSeverity;

  /**
   * The primitive this change affects.
   */
  primitive: string;

  /**
   * The sub-component this change affects (e.g., "Content", "Trigger").
   * Undefined for root-level changes.
   */
  subComponent?: string;

  /**
   * The target of the change (prop name, subcomponent name, etc.).
   */
  target: string;

  /**
   * The value/type before the change. Null for additions.
   */
  before: string | null;

  /**
   * The value/type after the change. Null for removals.
   */
  after: string | null;

  /**
   * Human-readable description of the change.
   */
  description: string;

  /**
   * Migration hint for addressing the change.
   */
  migration?: string;
}

/**
 * Summary counts for a diff operation.
 */
export interface DiffSummary {
  totalChanges: number;
  breaking: number;
  warnings: number;
  info: number;
}

/**
 * Result of diffing two Radix versions.
 */
export interface RadixDiff {
  /**
   * The starting version.
   */
  fromVersion: string;

  /**
   * The ending version.
   */
  toVersion: string;

  /**
   * Whether any breaking changes were detected.
   */
  hasBreakingChanges: boolean;

  /**
   * Summary counts by severity.
   */
  summary: DiffSummary;

  /**
   * All detected changes.
   */
  changes: RadixChange[];
}

/**
 * Result of checking for updates.
 */
export interface UpdateCheckResult {
  /**
   * The currently cached/used version.
   */
  currentVersion: string;

  /**
   * The latest available version.
   */
  latestVersion: string;

  /**
   * Whether an update is available.
   */
  hasUpdate: boolean;

  /**
   * Diff details if an update is available.
   */
  diff?: RadixDiff;
}
