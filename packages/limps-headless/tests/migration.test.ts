/**
 * Tests for migration analysis (Agent 2 Feature #3).
 */

import { describe, it, expect } from 'vitest';
import type { ComponentMetadata } from '../src/audit/types.js';
import { analyzeMigration, computeMigrationSummary } from '../src/audit/analyses/migration.js';

// Helper to create component metadata with specific backend
function createComponent(
  name: string,
  backend: ComponentMetadata['backend'],
  importSources: string[] = []
): ComponentMetadata {
  return {
    path: `src/components/${name}.tsx`,
    name,
    backend,
    mixedUsage: backend === 'mixed',
    importSources,
    evidence: [],
    exportsComponent: true,
    exportedNames: [name],
  };
}

// Test ID: migration-radix
describe('migration-radix', () => {
  it('generates deprecation issues for Radix components', () => {
    const inventory: ComponentMetadata[] = [
      createComponent('Dialog', 'radix', ['@radix-ui/react-dialog']),
      createComponent('Tooltip', 'radix', ['@radix-ui/react-tooltip']),
    ];

    const issues = analyzeMigration(inventory);

    expect(issues).toHaveLength(2);
    expect(issues[0].category).toBe('dependencies');
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].component).toBe('Dialog');
    expect(issues[0].message).toContain('legacy Radix UI');
    expect(issues[0].suggestion).toContain('Base UI');
  });

  it('does not generate issues for Base UI components', () => {
    const inventory: ComponentMetadata[] = [
      createComponent('Dialog', 'base', ['@base-ui-components/react']),
    ];

    const issues = analyzeMigration(inventory);

    expect(issues).toHaveLength(0);
  });

  it('does not generate issues for unknown backend components', () => {
    const inventory: ComponentMetadata[] = [createComponent('CustomButton', 'unknown', [])];

    const issues = analyzeMigration(inventory);

    expect(issues).toHaveLength(0);
  });
});

// Test ID: migration-mixed
describe('migration-mixed', () => {
  it('generates high-severity issues for mixed components', () => {
    const inventory: ComponentMetadata[] = [
      createComponent('MixedComponent', 'mixed', [
        '@radix-ui/react-dialog',
        '@base-ui-components/react',
      ]),
    ];

    const issues = analyzeMigration(inventory);

    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('migration');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].component).toBe('MixedComponent');
    expect(issues[0].message).toContain('both Radix and Base UI');
    expect(issues[0].suggestion).toContain('single headless library');
  });

  it('mixed components have higher severity than pure Radix', () => {
    const inventory: ComponentMetadata[] = [
      createComponent('RadixDialog', 'radix', ['@radix-ui/react-dialog']),
      createComponent('MixedWidget', 'mixed', [
        '@radix-ui/react-tooltip',
        '@base-ui-components/react',
      ]),
    ];

    const issues = analyzeMigration(inventory);

    const radixIssue = issues.find((i) => i.component === 'RadixDialog');
    const mixedIssue = issues.find((i) => i.component === 'MixedWidget');

    expect(radixIssue?.severity).toBe('medium');
    expect(mixedIssue?.severity).toBe('high');
  });

  it('avoids double-counting mixed components', () => {
    const inventory: ComponentMetadata[] = [
      createComponent('MixedComponent', 'mixed', [
        '@radix-ui/react-dialog',
        '@base-ui-components/react',
      ]),
    ];

    const issues = analyzeMigration(inventory);

    // Should only generate one issue (for mixed), not one for radix + one for mixed
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('migration');
  });
});

// Test ID: migration-readiness
describe('migration-readiness', () => {
  it('returns excellent when no Radix components (0%)', () => {
    const inventory: ComponentMetadata[] = [
      createComponent('Button', 'base', ['@base-ui-components/react']),
      createComponent('Dialog', 'base', ['@base-ui-components/react']),
      createComponent('Custom', 'unknown', []),
    ];

    const summary = computeMigrationSummary(inventory);

    expect(summary.migrationReadiness).toBe('excellent');
    expect(summary.legacyRadixCount).toBe(0);
  });

  it('returns excellent when inventory is empty', () => {
    const summary = computeMigrationSummary([]);

    expect(summary.migrationReadiness).toBe('excellent');
    expect(summary.legacyRadixCount).toBe(0);
  });

  it('returns good when 1-25% Radix', () => {
    // 1 radix out of 4 = 25%
    const inventory: ComponentMetadata[] = [
      createComponent('RadixDialog', 'radix', ['@radix-ui/react-dialog']),
      createComponent('Button', 'base', ['@base-ui-components/react']),
      createComponent('Select', 'base', ['@base-ui-components/react']),
      createComponent('Tooltip', 'base', ['@base-ui-components/react']),
    ];

    const summary = computeMigrationSummary(inventory);

    expect(summary.migrationReadiness).toBe('good');
    expect(summary.legacyRadixCount).toBe(1);
    expect(summary.backendCounts.radix).toBe(1);
    expect(summary.backendCounts.base).toBe(3);
  });

  it('returns needs-work when 26-75% Radix', () => {
    // 2 radix out of 4 = 50%
    const inventory: ComponentMetadata[] = [
      createComponent('RadixDialog', 'radix', ['@radix-ui/react-dialog']),
      createComponent('RadixTooltip', 'radix', ['@radix-ui/react-tooltip']),
      createComponent('Button', 'base', ['@base-ui-components/react']),
      createComponent('Select', 'base', ['@base-ui-components/react']),
    ];

    const summary = computeMigrationSummary(inventory);

    expect(summary.migrationReadiness).toBe('needs-work');
    expect(summary.legacyRadixCount).toBe(2);
  });

  it('returns urgent when >75% Radix', () => {
    // 4 radix out of 5 = 80%
    const inventory: ComponentMetadata[] = [
      createComponent('RadixDialog', 'radix', ['@radix-ui/react-dialog']),
      createComponent('RadixTooltip', 'radix', ['@radix-ui/react-tooltip']),
      createComponent('RadixMenu', 'radix', ['@radix-ui/react-dropdown-menu']),
      createComponent('RadixPopover', 'radix', ['@radix-ui/react-popover']),
      createComponent('Button', 'base', ['@base-ui-components/react']),
    ];

    const summary = computeMigrationSummary(inventory);

    expect(summary.migrationReadiness).toBe('urgent');
    expect(summary.legacyRadixCount).toBe(4);
  });

  it('includes mixed components in legacy Radix count', () => {
    // 1 radix + 1 mixed = 2 legacy out of 4 = 50%
    const inventory: ComponentMetadata[] = [
      createComponent('RadixDialog', 'radix', ['@radix-ui/react-dialog']),
      createComponent('MixedWidget', 'mixed', [
        '@radix-ui/react-tooltip',
        '@base-ui-components/react',
      ]),
      createComponent('Button', 'base', ['@base-ui-components/react']),
      createComponent('Select', 'base', ['@base-ui-components/react']),
    ];

    const summary = computeMigrationSummary(inventory);

    expect(summary.legacyRadixCount).toBe(2); // radix + mixed
    expect(summary.backendCounts.radix).toBe(1);
    expect(summary.backendCounts.mixed).toBe(1);
    expect(summary.migrationReadiness).toBe('needs-work');
  });

  it('returns backend counts correctly', () => {
    const inventory: ComponentMetadata[] = [
      createComponent('RadixDialog', 'radix', ['@radix-ui/react-dialog']),
      createComponent('BaseButton', 'base', ['@base-ui-components/react']),
      createComponent('MixedWidget', 'mixed', [
        '@radix-ui/react-tooltip',
        '@base-ui-components/react',
      ]),
      createComponent('Custom', 'unknown', []),
    ];

    const summary = computeMigrationSummary(inventory);

    expect(summary.backendCounts).toEqual({
      radix: 1,
      base: 1,
      mixed: 1,
      unknown: 1,
    });
  });
});
