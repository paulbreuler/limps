import { describe, it, expect } from 'vitest';
import { withNextSteps, toJsonText } from '../../src/utils/tool-response.js';
import type { NextStep } from '../../src/types.js';

const step: NextStep = {
  tool: 'list_agents',
  reason: 'View agents after creating a plan',
  params: { planId: '0001-feature' },
};

describe('withNextSteps', () => {
  it('should merge next_steps into payload', () => {
    const result = withNextSteps({ created: true }, [step]);
    expect(result.next_steps).toHaveLength(1);
    expect(result.next_steps[0].tool).toBe('list_agents');
    expect(result.created).toBe(true);
  });

  it('should preserve all original payload fields', () => {
    const result = withNextSteps({ a: 1, b: 'two' }, [step]);
    expect(result.a).toBe(1);
    expect(result.b).toBe('two');
  });

  it('should allow empty steps array', () => {
    const result = withNextSteps({ data: 42 }, []);
    expect(result.next_steps).toHaveLength(0);
  });
});

describe('toJsonText', () => {
  it('should produce valid JSON string', () => {
    const text = toJsonText({ key: 'value' }, [step]);
    const parsed = JSON.parse(text);
    expect(parsed.key).toBe('value');
    expect(parsed.next_steps).toHaveLength(1);
  });

  it('should format with indentation when prettyPrint=true', () => {
    const text = toJsonText({ key: 'value' }, [step], true);
    expect(text).toContain('\n');
    expect(text).toContain('  ');
  });

  it('should omit next_steps when steps array is empty', () => {
    const text = toJsonText({ key: 'value' }, []);
    const parsed = JSON.parse(text);
    expect(parsed.next_steps).toBeUndefined();
  });
});
