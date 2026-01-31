/**
 * Migration analysis for headless UI component inventory.
 * Feature #3: Generates migration issues and computes migration readiness.
 */

import type { ComponentMetadata, HeadlessBackend, Issue } from '../types.js';

/**
 * Migration readiness levels based on Radix percentage in codebase.
 */
export type MigrationReadiness = 'excellent' | 'good' | 'needs-work' | 'urgent';

/**
 * Summary of backend distribution and migration readiness.
 */
export interface MigrationSummary {
  backendCounts: Record<HeadlessBackend, number>;
  legacyRadixCount: number;
  migrationReadiness: MigrationReadiness;
}

/**
 * Analyze component inventory and generate migration-related issues.
 *
 * Issue generation rules:
 * - Radix components: 'dependencies' category, 'medium' severity
 * - Mixed components: 'migration' category, 'high' severity (mixed is worse than pure Radix)
 *
 * @param inventory - Array of discovered component metadata
 * @returns Array of migration-related issues
 */
export function analyzeMigration(inventory: ComponentMetadata[]): Issue[] {
  const issues: Issue[] = [];

  for (const component of inventory) {
    // Mixed components get high severity (harder to migrate than pure Radix)
    if (component.backend === 'mixed') {
      issues.push({
        component: component.name,
        category: 'migration',
        severity: 'high',
        message: `Component uses both Radix and Base UI (mixed usage)`,
        suggestion:
          'Standardize on a single headless library. Consider migrating Radix portions to Base UI.',
        evidence: component.importSources,
      });
    }
    // Pure Radix components get medium severity
    else if (component.backend === 'radix') {
      issues.push({
        component: component.name,
        category: 'dependencies',
        severity: 'medium',
        message: `Component uses legacy Radix UI primitives`,
        suggestion:
          'Consider migrating to Base UI for improved tree-shaking and smaller bundle size.',
        evidence: component.importSources,
      });
    }
  }

  return issues;
}

/**
 * Compute migration summary from component inventory.
 *
 * Readiness thresholds (based on Radix + mixed percentage):
 * - 0% Radix/mixed -> 'excellent'
 * - 1-25% -> 'good'
 * - 26-75% -> 'needs-work'
 * - >75% -> 'urgent'
 *
 * @param inventory - Array of discovered component metadata
 * @returns Migration summary with backend counts and readiness level
 */
export function computeMigrationSummary(inventory: ComponentMetadata[]): MigrationSummary {
  const backendCounts: Record<HeadlessBackend, number> = {
    radix: 0,
    base: 0,
    mixed: 0,
    unknown: 0,
  };

  for (const component of inventory) {
    backendCounts[component.backend]++;
  }

  // Legacy Radix count includes both pure radix and mixed (since mixed contains radix)
  const legacyRadixCount = backendCounts.radix + backendCounts.mixed;

  // Calculate readiness based on percentage of components needing migration
  const totalComponents = inventory.length;
  let migrationReadiness: MigrationReadiness;

  if (totalComponents === 0 || legacyRadixCount === 0) {
    migrationReadiness = 'excellent';
  } else {
    const radixPercentage = (legacyRadixCount / totalComponents) * 100;

    if (radixPercentage <= 25) {
      migrationReadiness = 'good';
    } else if (radixPercentage <= 75) {
      migrationReadiness = 'needs-work';
    } else {
      migrationReadiness = 'urgent';
    }
  }

  return {
    backendCounts,
    legacyRadixCount,
    migrationReadiness,
  };
}
