import type { Rule, Ruleset } from '../types.js';

const RADIX_IMPORTS = [
  'dialog',
  'popover',
  'tooltip',
  'select',
  'tabs',
  'toast',
  'dropdown-menu',
  'context-menu',
  'checkbox',
  'switch',
];

function importRule(module: string): Rule {
  return {
    id: `radix-legacy/import-${module}`,
    title: `Radix import: ${module}`,
    description: `Detects Radix legacy import for ${module}.`,
    severity: 'high',
    weight: 3,
    predicate: {
      any: [{ evidenceId: `import:radix-ui:${module}` }],
    },
    tags: ['radix', 'legacy', 'import'],
  };
}

const rules: Rule[] = [...RADIX_IMPORTS.map(importRule)];

export const radixLegacyRuleset: Ruleset = {
  id: 'radix-legacy',
  name: 'Radix Legacy',
  description: 'Detect legacy Radix usage via import evidence.',
  version: '0.1.0',
  rules,
  thresholds: {
    strong: 4,
    possible: 2,
  },
};
