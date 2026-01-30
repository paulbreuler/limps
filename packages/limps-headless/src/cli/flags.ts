/**
 * CLI policy flags for Agent 0 #5. Types live in audit/types.ts to avoid circular deps.
 */

import type { BackendMode, MigrationThreshold, RunAuditOptions } from '../audit/types.js';

export type { BackendMode, MigrationThreshold, RunAuditOptions };

export const DEFAULT_RUN_AUDIT_OPTIONS: RunAuditOptions = {
  backendMode: 'auto',
  migrationThreshold: 'medium',
  failOnMixed: false,
  includeLegacy: true,
};

export function parseBackendMode(value: string): BackendMode {
  const v = value?.toLowerCase();
  if (v === 'base' || v === 'radix-legacy' || v === 'auto') return v;
  return 'auto';
}

export function parseMigrationThreshold(value: string): MigrationThreshold {
  const v = value?.toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  return 'medium';
}
