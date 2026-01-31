/**
 * Radix UI backend provider implementation (Agent 1 #2).
 * Marked as deprecated to encourage migration to Base UI.
 */

import type { BackendProvider } from './interface.js';
import type { ComponentMetadata, Issue } from '../audit/types.js';

/** Import patterns for Radix UI packages. */
const RADIX_IMPORT_PATTERNS = [
  /^@radix-ui\/react-/,
  /^@radix-ui\/primitive/,
  /^radix-ui$/,
  /^radix-ui\//,
];

/** JSX attribute patterns that indicate Radix UI usage. */
const RADIX_EVIDENCE_PATTERNS = ['asChild'];

/**
 * Radix UI backend provider.
 * Marked as deprecated - projects should consider migrating to Base UI.
 */
export const radixBackendProvider: BackendProvider = {
  id: 'radix',
  label: 'Radix UI (Legacy)',
  deprecated: true,

  detectImports(imports: string[]): boolean {
    return imports.some((imp) =>
      RADIX_IMPORT_PATTERNS.some((pattern) => pattern.test(imp))
    );
  },

  detectPatterns(evidence: string[]): boolean {
    return evidence.some((e) => RADIX_EVIDENCE_PATTERNS.includes(e));
  },

  analyzeComponent(component: ComponentMetadata): Issue[] {
    const issues: Issue[] = [];

    // Radix-specific checks
    if (component.backend === 'radix') {
      // Check for asChild usage (common Radix pattern)
      if (component.evidence.includes('asChild')) {
        // This is fine, but note it for migration planning
        issues.push({
          component: component.name,
          category: 'migration',
          severity: 'low',
          message: `Component "${component.name}" uses asChild pattern which needs migration attention.`,
          suggestion: 'When migrating to Base UI, replace asChild with render prop pattern.',
          evidence: ['asChild'],
        });
      }

      // Deprecation warning
      issues.push({
        component: component.name,
        category: 'dependencies',
        severity: 'low',
        message: `Component "${component.name}" uses Radix UI which is considered legacy.`,
        suggestion: 'Consider migrating to Base UI for better long-term support.',
        evidence: component.importSources,
      });
    }

    // Check for mixed usage
    if (component.mixedUsage) {
      issues.push({
        component: component.name,
        category: 'migration',
        severity: 'medium',
        message: `Component "${component.name}" uses both Radix and Base UI. Migration in progress?`,
        suggestion: 'Complete migration to Base UI for consistency.',
        evidence: component.importSources,
      });
    }

    return issues;
  },

  analyzeProject(components: ComponentMetadata[]): Issue[] {
    const issues: Issue[] = [];

    const radixComponents = components.filter((c) => c.backend === 'radix');
    const mixedComponents = components.filter((c) => c.mixedUsage);

    // Project-level deprecation warning
    if (radixComponents.length > 0) {
      issues.push({
        category: 'dependencies',
        severity: 'medium',
        message: `${radixComponents.length} component(s) still use Radix UI (deprecated).`,
        suggestion: 'Plan migration to Base UI. Use limps-headless audit for migration guidance.',
        evidence: radixComponents.slice(0, 5).map((c) => c.path),
      });
    }

    // Mixed usage warning
    if (mixedComponents.length > 0) {
      issues.push({
        category: 'migration',
        severity: 'medium',
        message: `${mixedComponents.length} component(s) have mixed Radix/Base usage.`,
        suggestion: 'Complete migration for these components first.',
        evidence: mixedComponents.map((c) => c.path),
      });
    }

    // Migration readiness assessment
    const totalHeadless = components.filter((c) => c.backend !== 'unknown').length;
    if (totalHeadless > 0) {
      const legacyRate = Math.round((radixComponents.length / totalHeadless) * 100);
      if (legacyRate > 50) {
        issues.push({
          category: 'migration',
          severity: 'high',
          message: `${legacyRate}% of headless components still use Radix UI.`,
          suggestion: 'Prioritize migration to reduce technical debt.',
        });
      }
    }

    return issues;
  },
};
