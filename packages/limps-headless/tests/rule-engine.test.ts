import { describe, it, expect } from 'vitest';
import type { ComponentIR } from '../src/analysis/ir/types.js';
import { evaluateRuleset } from '../src/rules/engine.js';
import type { Ruleset } from '../src/rules/types.js';

function makeIr(evidenceIds: string[], roles: string[] = []): ComponentIR {
  return {
    id: 'Demo#Demo',
    filePath: '/tmp/Demo.tsx',
    exportName: 'Demo',
    localName: 'Demo',
    imports: [],
    jsx: {
      elements: [],
      attributes: [],
      roles,
      dataAttrs: [],
    },
    behaviors: {
      behaviors: [],
      handlers: [],
    },
    evidence: evidenceIds.map((id) => ({
      id,
      source: 'import',
      strength: 'strong',
      weight: 3,
    })),
    dependencies: [],
    reexports: [],
  };
}

describe('rule engine', () => {
  it('evaluates any/all/not predicates', () => {
    const ruleset: Ruleset = {
      id: 'test',
      name: 'Test',
      description: 'test',
      version: '0.0.0',
      thresholds: { strong: 3, possible: 2 },
      rules: [
        {
          id: 'any-rule',
          title: 'any rule',
          description: 'any',
          severity: 'low',
          weight: 2,
          predicate: { any: [{ evidenceId: 'import:base-ui:tabs' }] },
        },
        {
          id: 'all-rule',
          title: 'all rule',
          description: 'all',
          severity: 'low',
          weight: 2,
          predicate: {
            all: [
              { evidenceId: 'import:base-ui:tabs' },
              { evidenceId: 'import:base-ui:select' },
            ],
          },
        },
        {
          id: 'not-rule',
          title: 'not rule',
          description: 'not',
          severity: 'low',
          weight: 2,
          predicate: {
            any: [{ evidenceId: 'import:base-ui:tabs' }],
            not: { evidenceId: 'import:radix-ui:tabs' },
          },
        },
      ],
    };

    const ir = makeIr([
      'import:base-ui:tabs',
      'import:base-ui:select',
    ]);

    const result = evaluateRuleset(ir, ruleset);
    const matches = result.matches.filter((m) => m.matched).map((m) => m.ruleId);
    expect(matches).toContain('any-rule');
    expect(matches).toContain('all-rule');
    expect(matches).toContain('not-rule');
  });

  it('classifies by thresholds', () => {
    const ruleset: Ruleset = {
      id: 'test-thresholds',
      name: 'Test Thresholds',
      description: 'test',
      version: '0.0.0',
      thresholds: { strong: 4, possible: 2 },
      rules: [
        {
          id: 'rule-1',
          title: 'rule 1',
          description: 'rule 1',
          severity: 'low',
          weight: 2,
          predicate: { any: [{ evidenceId: 'import:base-ui:tabs' }] },
        },
        {
          id: 'rule-2',
          title: 'rule 2',
          description: 'rule 2',
          severity: 'low',
          weight: 2,
          predicate: { any: [{ evidenceId: 'import:base-ui:select' }] },
        },
      ],
    };

    const possibleResult = evaluateRuleset(
      makeIr(['import:base-ui:tabs']),
      ruleset
    );
    expect(possibleResult.classification).toBe('possible');

    const strongResult = evaluateRuleset(
      makeIr(['import:base-ui:tabs', 'import:base-ui:select']),
      ruleset
    );
    expect(strongResult.classification).toBe('strong');
  });
});
