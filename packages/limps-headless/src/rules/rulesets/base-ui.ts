import type { Rule, Ruleset } from '../types.js';

const BASE_IMPORTS = [
  'tabs',
  'select',
  'switch',
  'checkbox',
  'menu',
  'popover',
  'tooltip',
  'button',
  'scroll-area',
  'separator',
];

const BASE_ROLES = [
  'tablist',
  'tab',
  'tabpanel',
  'menu',
  'menuitem',
  'listbox',
  'option',
  'switch',
  'checkbox',
];

function importRule(module: string): Rule {
  return {
    id: `base-ui/import-${module}`,
    title: `Base UI import: ${module}`,
    description: `Detects Base UI import for ${module}.`,
    severity: 'medium',
    weight: 3,
    predicate: {
      any: [{ evidenceId: `import:base-ui:${module}` }],
    },
    tags: ['base-ui', 'import'],
  };
}

function roleRule(role: string): Rule {
  return {
    id: `base-ui/role-${role}`,
    title: `Base UI role evidence: ${role}`,
    description: `Detects JSX role usage for ${role}.`,
    severity: 'low',
    weight: 1,
    predicate: {
      any: [{ role }],
    },
    tags: ['base-ui', 'role'],
  };
}

const rules: Rule[] = [...BASE_IMPORTS.map(importRule), ...BASE_ROLES.map(roleRule)];

export const baseUiRuleset: Ruleset = {
  id: 'base-ui',
  name: 'Base UI',
  description: 'Detect Base UI usage via import and role evidence.',
  version: '0.1.0',
  rules,
  thresholds: {
    strong: 4,
    possible: 2,
  },
};
