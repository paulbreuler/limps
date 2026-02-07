/**
 * Base UI backend provider implementation (Agent 1 #2).
 */

import type { BackendProvider } from './interface.js';
import type { ComponentMetadata, Issue } from '../audit/types.js';

/** Import patterns for Base UI packages. */
const BASE_IMPORT_PATTERNS = [
  /^@base-ui\/react/,
  /^@base-ui\//,
  /^@base-ui-components\//,
  /^@base_ui\//,
];

/** JSX attribute patterns that indicate Base UI usage. */
const BASE_EVIDENCE_PATTERNS = ['render'];

/**
 * Base UI backend provider.
 * Base UI is the modern headless UI library from the MUI team.
 */
export const baseProvider: BackendProvider = {
  id: 'base',
  label: 'Base UI',
  deprecated: false,

  detectImports(imports: string[]): boolean {
    return imports.some((imp) => BASE_IMPORT_PATTERNS.some((pattern) => pattern.test(imp)));
  },

  detectPatterns(evidence: string[]): boolean {
    return evidence.some((e) => BASE_EVIDENCE_PATTERNS.includes(e));
  },

  analyzeComponent(component: ComponentMetadata): Issue[] {
    const issues: Issue[] = [];

    // Check for missing render prop pattern when using Base UI
    if (component.backend === 'base') {
      // Base UI components typically use render prop pattern
      if (!component.evidence.includes('render')) {
        // This is informational, not necessarily an issue
        // Base UI can work without render prop for simple cases
      }
    }

    // Check for mixed usage (potential migration issue)
    if (component.mixedUsage) {
      issues.push({
        component: component.name,
        category: 'migration',
        severity: 'medium',
        message: `Component "${component.name}" uses both Radix and Base UI. Consider completing migration.`,
        suggestion: 'Migrate fully to Base UI for consistency.',
        evidence: component.importSources,
      });
    }

    return issues;
  },

  analyzeProject(components: ComponentMetadata[]): Issue[] {
    const issues: Issue[] = [];

    const baseComponents = components.filter((c) => c.backend === 'base');
    const mixedComponents = components.filter((c) => c.mixedUsage);

    // Project-level consistency check
    if (mixedComponents.length > 0) {
      issues.push({
        category: 'migration',
        severity: 'medium',
        message: `${mixedComponents.length} component(s) have mixed Radix/Base usage.`,
        suggestion: 'Review mixed components and plan migration strategy.',
        evidence: mixedComponents.map((c) => c.path),
      });
    }

    // Check for Base UI adoption progress
    const totalHeadless = components.filter((c) => c.backend !== 'unknown').length;
    if (totalHeadless > 0 && baseComponents.length > 0) {
      const adoptionRate = Math.round((baseComponents.length / totalHeadless) * 100);
      if (adoptionRate < 50) {
        issues.push({
          category: 'migration',
          severity: 'low',
          message: `Base UI adoption is at ${adoptionRate}%. Consider increasing adoption.`,
          suggestion: 'Plan migration of remaining Radix components to Base UI.',
        });
      }
    }

    return issues;
  },
};
