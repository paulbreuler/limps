import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { analyzeComponent } from '../src/analyzer/index.js';
import { evaluateRuleset, baseUiRuleset } from '../src/rules/index.js';

const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'base-import.tsx');

describe('analyze integration', () => {
  it('evaluates Base UI ruleset from analysis IR', async () => {
    const analysis = await analyzeComponent(fixturePath);
    expect(analysis.ir).toBeDefined();
    const evaluation = evaluateRuleset(analysis.ir!, baseUiRuleset);
    expect(evaluation.classification).toBe('possible');
  });
});
