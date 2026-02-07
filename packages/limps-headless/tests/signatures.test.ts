/**
 * Tests for the signatures module.
 * TDD tests from agent 002 plan.
 */

import { describe, it, expect } from 'vitest';
import {
  inferStatePattern,
  inferCompositionPattern,
  inferRenderingPattern,
} from '../src/signatures/inference.js';
import {
  getDistinguishingProps,
  getAntiPatternProps,
  getKnownPrimitives,
  isKnownPrimitive,
} from '../src/signatures/distinguishing.js';
import {
  getSimilarPrimitives,
  getDisambiguationRule,
  getSimilarityGroup,
  areSimilar,
} from '../src/signatures/disambiguation.js';
import { generateSignature } from '../src/signatures/generator.js';
import type {
  PropDefinition,
  SubComponentDefinition,
  ExtractedPrimitive,
} from '../src/types/index.js';

// Helper to create PropDefinition
function createProp(name: string, overrides: Partial<PropDefinition> = {}): PropDefinition {
  return {
    name,
    type: 'unknown',
    required: false,
    isStateControl: false,
    isEventHandler: false,
    isConfiguration: false,
    isComposition: false,
    ...overrides,
  };
}

// Helper to create SubComponentDefinition
function createSubComponent(name: string, props: PropDefinition[] = []): SubComponentDefinition {
  return {
    name,
    props,
    isRequired: false,
  };
}

describe('signatures/inference', () => {
  describe('inferStatePattern', () => {
    it('open/onOpenChange → binary', () => {
      const props = [
        createProp('open', { type: 'boolean', isStateControl: true }),
        createProp('onOpenChange', { type: '(open: boolean) => void', isEventHandler: true }),
      ];
      expect(inferStatePattern(props)).toBe('binary');
    });

    it('defaultOpen/onOpenChange → binary', () => {
      const props = [
        createProp('defaultOpen', { type: 'boolean', isStateControl: true }),
        createProp('onOpenChange', { type: '(open: boolean) => void', isEventHandler: true }),
      ];
      expect(inferStatePattern(props)).toBe('binary');
    });

    it('checked/onCheckedChange → binary', () => {
      const props = [
        createProp('checked', { type: 'boolean', isStateControl: true }),
        createProp('onCheckedChange', { type: '(checked: boolean) => void', isEventHandler: true }),
      ];
      expect(inferStatePattern(props)).toBe('binary');
    });

    it('pressed/onPressedChange → binary', () => {
      const props = [
        createProp('pressed', { type: 'boolean', isStateControl: true }),
        createProp('onPressedChange', { type: '(pressed: boolean) => void', isEventHandler: true }),
      ];
      expect(inferStatePattern(props)).toBe('binary');
    });

    it('value/onValueChange → single-value', () => {
      const props = [
        createProp('value', { type: 'string', isStateControl: true }),
        createProp('onValueChange', { type: '(value: string) => void', isEventHandler: true }),
      ];
      expect(inferStatePattern(props)).toBe('single-value');
    });

    it('value[]/onValueChange → multi-value', () => {
      const props = [
        createProp('value', { type: 'string[]', isStateControl: true }),
        createProp('onValueChange', { type: '(value: string[]) => void', isEventHandler: true }),
      ];
      expect(inferStatePattern(props)).toBe('multi-value');
    });

    it('min/max/step → range', () => {
      const props = [
        createProp('min', { type: 'number' }),
        createProp('max', { type: 'number' }),
        createProp('step', { type: 'number' }),
        createProp('value', { type: 'number[]' }),
      ];
      expect(inferStatePattern(props)).toBe('range');
    });

    it('no state props → none', () => {
      const props = [
        createProp('className', { type: 'string' }),
        createProp('children', { type: 'React.ReactNode', isComposition: true }),
      ];
      expect(inferStatePattern(props)).toBe('none');
    });

    it('text input pattern → text', () => {
      const props = [
        createProp('value', { type: 'string', isStateControl: true }),
        createProp('onChange', { type: '(e: React.ChangeEvent) => void', isEventHandler: true }),
      ];
      expect(inferStatePattern(props)).toBe('text');
    });
  });

  describe('inferCompositionPattern', () => {
    it('3+ sub-components → compound', () => {
      const subComponents = [
        createSubComponent('Root'),
        createSubComponent('Trigger'),
        createSubComponent('Content'),
        createSubComponent('Close'),
      ];
      expect(inferCompositionPattern(subComponents)).toBe('compound');
    });

    it('Trigger + Content pattern → compound', () => {
      const subComponents = [createSubComponent('Trigger'), createSubComponent('Content')];
      expect(inferCompositionPattern(subComponents)).toBe('compound');
    });

    it('single component → monolithic', () => {
      const subComponents = [
        createSubComponent('Root', [createProp('checked'), createProp('asChild')]),
      ];
      expect(inferCompositionPattern(subComponents)).toBe('monolithic');
    });

    it('empty sub-components → monolithic', () => {
      const subComponents: SubComponentDefinition[] = [];
      expect(inferCompositionPattern(subComponents)).toBe('monolithic');
    });

    it('provider-only pattern → provider', () => {
      const subComponents = [createSubComponent('Provider', [createProp('dir')])];
      expect(inferCompositionPattern(subComponents)).toBe('provider');
    });
  });

  describe('inferRenderingPattern', () => {
    it('Portal sub-component → portal', () => {
      const subComponents = [
        createSubComponent('Root'),
        createSubComponent('Portal'),
        createSubComponent('Content'),
      ];
      const props: PropDefinition[] = [];
      expect(inferRenderingPattern(subComponents, props)).toBe('portal');
    });

    it('Portal + open state → portal-conditional', () => {
      const subComponents = [
        createSubComponent('Root'),
        createSubComponent('Trigger'),
        createSubComponent('Portal'),
        createSubComponent('Content'),
      ];
      const props = [
        createProp('open', { type: 'boolean', isStateControl: true }),
        createProp('onOpenChange', { type: '(open: boolean) => void', isEventHandler: true }),
      ];
      expect(inferRenderingPattern(subComponents, props)).toBe('portal-conditional');
    });

    it('Overlay + open state → portal-conditional', () => {
      const subComponents = [
        createSubComponent('Root'),
        createSubComponent('Trigger'),
        createSubComponent('Overlay'),
        createSubComponent('Content'),
      ];
      const props = [
        createProp('open', { type: 'boolean', isStateControl: true }),
        createProp('onOpenChange', { type: '(open: boolean) => void', isEventHandler: true }),
      ];
      expect(inferRenderingPattern(subComponents, props)).toBe('portal-conditional');
    });

    it('forceMount prop → conditional', () => {
      const subComponents = [
        createSubComponent('Root'),
        createSubComponent('Item'),
        createSubComponent('Content', [createProp('forceMount', { type: 'boolean' })]),
      ];
      const props: PropDefinition[] = [];
      expect(inferRenderingPattern(subComponents, props)).toBe('conditional');
    });

    it('no portal/overlay/forceMount → inline', () => {
      const subComponents = [createSubComponent('Root', [createProp('checked')])];
      const props: PropDefinition[] = [];
      expect(inferRenderingPattern(subComponents, props)).toBe('inline');
    });
  });
});

describe('signatures/distinguishing', () => {
  describe('getDistinguishingProps', () => {
    it('Dialog includes modal and Overlay', () => {
      const props = getDistinguishingProps('Dialog');
      expect(props).toContain('modal');
      expect(props).toContain('Overlay');
    });

    it('Tooltip includes delayDuration', () => {
      const props = getDistinguishingProps('Tooltip');
      expect(props).toContain('delayDuration');
      expect(props).toContain('skipDelayDuration');
    });

    it('Select includes Value and Viewport', () => {
      const props = getDistinguishingProps('Select');
      expect(props).toContain('Value');
      expect(props).toContain('Viewport');
    });

    it('unknown primitive returns empty array', () => {
      const props = getDistinguishingProps('UnknownPrimitive');
      expect(props).toEqual([]);
    });
  });

  describe('getAntiPatternProps', () => {
    it('Dialog has Action/Cancel as anti-patterns', () => {
      const props = getAntiPatternProps('Dialog');
      expect(props).toContain('Action');
      expect(props).toContain('Cancel');
    });

    it('Popover has delay props as anti-patterns', () => {
      const props = getAntiPatternProps('Popover');
      expect(props).toContain('delayDuration');
      expect(props).toContain('openDelay');
    });

    it('unknown primitive returns empty array', () => {
      const props = getAntiPatternProps('UnknownPrimitive');
      expect(props).toEqual([]);
    });
  });

  describe('getKnownPrimitives', () => {
    it('returns array of known primitives', () => {
      const primitives = getKnownPrimitives();
      expect(primitives).toContain('Dialog');
      expect(primitives).toContain('Select');
      expect(primitives).toContain('Checkbox');
      expect(primitives.length).toBeGreaterThan(10);
    });
  });

  describe('isKnownPrimitive', () => {
    it('returns true for known primitives', () => {
      expect(isKnownPrimitive('Dialog')).toBe(true);
      expect(isKnownPrimitive('Tooltip')).toBe(true);
    });

    it('returns false for unknown primitives', () => {
      expect(isKnownPrimitive('Unknown')).toBe(false);
    });
  });
});

describe('signatures/disambiguation', () => {
  describe('getSimilarPrimitives', () => {
    it('Dialog similar to AlertDialog', () => {
      const similar = getSimilarPrimitives('Dialog');
      expect(similar).toContain('AlertDialog');
    });

    it('Popover similar to Tooltip and HoverCard', () => {
      const similar = getSimilarPrimitives('Popover');
      expect(similar).toContain('Tooltip');
      expect(similar).toContain('HoverCard');
    });

    it('unknown primitive returns empty array', () => {
      const similar = getSimilarPrimitives('UnknownPrimitive');
      expect(similar).toEqual([]);
    });
  });

  describe('getDisambiguationRule', () => {
    it('returns human-readable rule for Dialog', () => {
      const rule = getDisambiguationRule('Dialog');
      expect(rule).toBeDefined();
      expect(rule).toContain('modal');
    });

    it('returns human-readable rule for Tooltip', () => {
      const rule = getDisambiguationRule('Tooltip');
      expect(rule).toBeDefined();
      expect(rule).toContain('delayDuration');
    });

    it('returns undefined for unknown primitive', () => {
      const rule = getDisambiguationRule('UnknownPrimitive');
      expect(rule).toBeUndefined();
    });
  });

  describe('getSimilarityGroup', () => {
    it('returns primitive and all similar ones', () => {
      const group = getSimilarityGroup('Dialog');
      expect(group).toContain('Dialog');
      expect(group).toContain('AlertDialog');
    });

    it('returns single primitive if no similar', () => {
      const group = getSimilarityGroup('UnknownPrimitive');
      expect(group).toEqual(['UnknownPrimitive']);
    });
  });

  describe('areSimilar', () => {
    it('returns true for similar primitives', () => {
      expect(areSimilar('Dialog', 'AlertDialog')).toBe(true);
      expect(areSimilar('Tooltip', 'Popover')).toBe(true);
    });

    it('returns false for non-similar primitives', () => {
      expect(areSimilar('Dialog', 'Checkbox')).toBe(false);
    });
  });
});

describe('generateSignature', () => {
  it('generates complete BehaviorSignature from ExtractedPrimitive', () => {
    const extracted: ExtractedPrimitive = {
      name: 'Dialog',
      package: '@radix-ui/react-dialog',
      version: '1.0.5',
      extractedAt: new Date().toISOString(),
      rootProps: [
        createProp('open', { type: 'boolean', isStateControl: true }),
        createProp('onOpenChange', {
          type: '(open: boolean) => void',
          isEventHandler: true,
        }),
        createProp('modal', { type: 'boolean', isConfiguration: true }),
      ],
      subComponents: [
        createSubComponent('Root'),
        createSubComponent('Trigger'),
        createSubComponent('Portal'),
        createSubComponent('Overlay'),
        createSubComponent('Content'),
        createSubComponent('Close'),
      ],
      exports: ['Root', 'Trigger', 'Portal', 'Overlay', 'Content', 'Close'],
      usesContext: true,
    };

    const signature = generateSignature(extracted);

    // Basic properties
    expect(signature.primitive).toBe('Dialog');
    expect(signature.package).toBe('@radix-ui/react-dialog');
    expect(signature.version).toBe('1.0.5');

    // Inferred patterns
    expect(signature.statePattern).toBe('binary');
    expect(signature.compositionPattern).toBe('compound');
    expect(signature.renderingPattern).toBe('portal-conditional');

    // Distinguishing props
    expect(signature.distinguishingProps).toContain('modal');
    expect(signature.distinguishingProps).toContain('Overlay');

    // Anti-pattern props
    expect(signature.antiPatternProps).toContain('Action');
    expect(signature.antiPatternProps).toContain('Cancel');

    // Sub-components with roles
    expect(signature.subComponents.length).toBe(6);
    const trigger = signature.subComponents.find((c) => c.name === 'Trigger');
    expect(trigger?.role).toBe('trigger');
    const content = signature.subComponents.find((c) => c.name === 'Content');
    expect(content?.role).toBe('content');
    const overlay = signature.subComponents.find((c) => c.name === 'Overlay');
    expect(overlay?.role).toBe('overlay');

    // Disambiguation
    expect(signature.similarTo).toContain('AlertDialog');
    expect(signature.disambiguationRule).toBeDefined();
  });

  it('handles monolithic component (Checkbox)', () => {
    const extracted: ExtractedPrimitive = {
      name: 'Checkbox',
      package: '@radix-ui/react-checkbox',
      version: '1.0.4',
      extractedAt: new Date().toISOString(),
      rootProps: [
        createProp('checked', { type: 'boolean', isStateControl: true }),
        createProp('onCheckedChange', {
          type: '(checked: boolean) => void',
          isEventHandler: true,
        }),
      ],
      subComponents: [createSubComponent('Root'), createSubComponent('Indicator')],
      exports: ['Root', 'Indicator'],
      usesContext: false,
    };

    const signature = generateSignature(extracted);

    expect(signature.statePattern).toBe('binary');
    expect(signature.compositionPattern).toBe('monolithic');
    expect(signature.renderingPattern).toBe('inline');
  });

  it('handles range component (Slider)', () => {
    const extracted: ExtractedPrimitive = {
      name: 'Slider',
      package: '@radix-ui/react-slider',
      version: '1.1.2',
      extractedAt: new Date().toISOString(),
      rootProps: [
        createProp('value', { type: 'number[]', isStateControl: true }),
        createProp('onValueChange', {
          type: '(value: number[]) => void',
          isEventHandler: true,
        }),
        createProp('min', { type: 'number' }),
        createProp('max', { type: 'number' }),
        createProp('step', { type: 'number' }),
      ],
      subComponents: [
        createSubComponent('Root'),
        createSubComponent('Track'),
        createSubComponent('Range'),
        createSubComponent('Thumb'),
      ],
      exports: ['Root', 'Track', 'Range', 'Thumb'],
      usesContext: false,
    };

    const signature = generateSignature(extracted);

    expect(signature.statePattern).toBe('range');
    expect(signature.compositionPattern).toBe('compound');
  });
});
