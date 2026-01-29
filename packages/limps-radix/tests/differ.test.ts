/**
 * Tests for the differ module.
 */

import { describe, it, expect } from 'vitest';
import type { ExtractedPrimitive, PropDefinition } from '../src/types/index.js';
import {
  diffContracts,
  diffProps,
  diffSubComponents,
  parseUnionMembers,
  isNarrowing,
  isWidening,
  getSeverity,
  isBreaking,
  sortBySeverity,
  generateHint,
  generateDescription,
  type RadixChange,
} from '../src/differ/index.js';

/**
 * Create a minimal prop definition for testing.
 */
function createProp(
  name: string,
  type: string,
  required = false,
  defaultValue?: string
): PropDefinition {
  return {
    name,
    type,
    required,
    defaultValue,
    description: '',
    isStateControl: false,
    isEventHandler: false,
    isConfiguration: false,
    isComposition: false,
  };
}

/**
 * Create a minimal ExtractedPrimitive for testing.
 */
function createPrimitive(
  name: string,
  rootProps: PropDefinition[] = [],
  subComponents: { name: string; props: PropDefinition[] }[] = []
): ExtractedPrimitive {
  return {
    name,
    package: `@radix-ui/react-${name.toLowerCase()}`,
    version: '1.0.0',
    extractedAt: new Date().toISOString(),
    rootProps,
    subComponents: subComponents.map((sc) => ({
      name: sc.name,
      props: sc.props,
      isRequired: false,
    })),
    exports: [],
    usesContext: false,
  };
}

describe('parseUnionMembers', () => {
  it('parses simple types', () => {
    expect(parseUnionMembers('string')).toEqual(['string']);
    expect(parseUnionMembers('number')).toEqual(['number']);
  });

  it('parses simple unions', () => {
    expect(parseUnionMembers('string | number')).toEqual(['string', 'number']);
    expect(parseUnionMembers('"left" | "right" | "center"')).toEqual([
      '"left"',
      '"right"',
      '"center"',
    ]);
  });

  it('handles generic types in unions', () => {
    expect(parseUnionMembers('Array<string> | null')).toEqual([
      'Array<string>',
      'null',
    ]);
  });

  it('handles complex nested types', () => {
    expect(parseUnionMembers('{ a: string } | null')).toEqual([
      '{ a: string }',
      'null',
    ]);
  });

  it('handles function types with unions in parameters', () => {
    expect(parseUnionMembers('(a: string | number) => void')).toEqual([
      '(a: string | number) => void',
    ]);
    expect(parseUnionMembers('((props: { open: boolean }) => void) | undefined')).toEqual([
      '((props: { open: boolean }) => void)',
      'undefined',
    ]);
  });

  it('handles deeply nested generics', () => {
    expect(parseUnionMembers('Array<string | number> | Set<boolean>')).toEqual([
      'Array<string | number>',
      'Set<boolean>',
    ]);
  });

  it('handles React types', () => {
    expect(parseUnionMembers('React.ReactNode | undefined')).toEqual([
      'React.ReactNode',
      'undefined',
    ]);
  });
});

describe('isNarrowing', () => {
  it('detects narrowing from union to single type', () => {
    expect(isNarrowing('string | number', 'string')).toBe(true);
    expect(isNarrowing('"a" | "b" | "c"', '"a" | "b"')).toBe(true);
  });

  it('returns false for same types', () => {
    expect(isNarrowing('string', 'string')).toBe(false);
    expect(isNarrowing('string | number', 'string | number')).toBe(false);
  });

  it('returns false for widening', () => {
    expect(isNarrowing('string', 'string | number')).toBe(false);
  });

  it('returns false for completely different types', () => {
    expect(isNarrowing('string', 'number')).toBe(false);
  });

  it('returns false for same members in different order', () => {
    expect(isNarrowing('"a" | "b"', '"b" | "a"')).toBe(false);
    expect(isNarrowing('string | number | boolean', 'boolean | string | number')).toBe(false);
  });

  it('handles undefined in unions correctly', () => {
    expect(isNarrowing('string | undefined', 'string')).toBe(true);
    expect(isNarrowing('string | null | undefined', 'string | null')).toBe(true);
  });
});

describe('isWidening', () => {
  it('detects widening from single to union type', () => {
    expect(isWidening('string', 'string | number')).toBe(true);
    expect(isWidening('"a" | "b"', '"a" | "b" | "c"')).toBe(true);
  });

  it('returns false for same types', () => {
    expect(isWidening('string', 'string')).toBe(false);
    expect(isWidening('string | number', 'string | number')).toBe(false);
  });

  it('returns false for narrowing', () => {
    expect(isWidening('string | number', 'string')).toBe(false);
  });

  it('returns false for same members in different order', () => {
    expect(isWidening('"a" | "b"', '"b" | "a"')).toBe(false);
  });

  it('returns false for completely different types of same size', () => {
    expect(isWidening('"a" | "b"', '"c" | "d"')).toBe(false);
  });

  it('handles undefined in unions correctly', () => {
    expect(isWidening('string', 'string | undefined')).toBe(true);
    expect(isWidening('string | null', 'string | null | undefined')).toBe(true);
  });
});

describe('getSeverity', () => {
  it('classifies breaking changes', () => {
    expect(getSeverity('prop_removed')).toBe('breaking');
    expect(getSeverity('prop_required')).toBe('breaking');
    expect(getSeverity('subcomponent_removed')).toBe('breaking');
    expect(getSeverity('type_narrowed')).toBe('breaking');
  });

  it('classifies warnings', () => {
    expect(getSeverity('prop_deprecated')).toBe('warning');
    expect(getSeverity('type_changed')).toBe('warning');
    expect(getSeverity('default_changed')).toBe('warning');
  });

  it('classifies info changes', () => {
    expect(getSeverity('prop_added')).toBe('info');
    expect(getSeverity('subcomponent_added')).toBe('info');
    expect(getSeverity('type_widened')).toBe('info');
  });
});

describe('isBreaking', () => {
  it('returns true for breaking change types', () => {
    expect(isBreaking('prop_removed')).toBe(true);
    expect(isBreaking('prop_required')).toBe(true);
  });

  it('returns false for non-breaking change types', () => {
    expect(isBreaking('prop_added')).toBe(false);
    expect(isBreaking('type_widened')).toBe(false);
  });
});

describe('sortBySeverity', () => {
  it('sorts breaking changes first', () => {
    const changes: Pick<RadixChange, 'severity'>[] = [
      { severity: 'info' },
      { severity: 'breaking' },
      { severity: 'warning' },
    ];

    const sorted = sortBySeverity(changes);

    expect(sorted[0].severity).toBe('breaking');
    expect(sorted[1].severity).toBe('warning');
    expect(sorted[2].severity).toBe('info');
  });
});

describe('diffProps', () => {
  it('detects added props', () => {
    const before: PropDefinition[] = [createProp('open', 'boolean')];
    const after: PropDefinition[] = [
      createProp('open', 'boolean'),
      createProp('modal', 'boolean'),
    ];

    const changes = diffProps(before, after, 'Dialog');

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('prop_added');
    expect(changes[0].target).toBe('modal');
    expect(changes[0].severity).toBe('info');
  });

  it('detects removed props', () => {
    const before: PropDefinition[] = [
      createProp('open', 'boolean'),
      createProp('allowPinchZoom', 'boolean'),
    ];
    const after: PropDefinition[] = [createProp('open', 'boolean')];

    const changes = diffProps(before, after, 'Dialog');

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('prop_removed');
    expect(changes[0].target).toBe('allowPinchZoom');
    expect(changes[0].severity).toBe('breaking');
  });

  it('detects required changes (optional -> required)', () => {
    const before: PropDefinition[] = [createProp('open', 'boolean', false)];
    const after: PropDefinition[] = [createProp('open', 'boolean', true)];

    const changes = diffProps(before, after, 'Dialog');

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('prop_required');
    expect(changes[0].severity).toBe('breaking');
  });

  it('detects type narrowing as breaking', () => {
    const before: PropDefinition[] = [createProp('side', '"left" | "right" | "top"')];
    const after: PropDefinition[] = [createProp('side', '"left" | "right"')];

    const changes = diffProps(before, after, 'Popover');

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('type_narrowed');
    expect(changes[0].severity).toBe('breaking');
  });

  it('detects type widening as info', () => {
    const before: PropDefinition[] = [createProp('side', '"left" | "right"')];
    const after: PropDefinition[] = [createProp('side', '"left" | "right" | "top"')];

    const changes = diffProps(before, after, 'Popover');

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('type_widened');
    expect(changes[0].severity).toBe('info');
  });

  it('detects type changes that are neither narrowing nor widening', () => {
    const before: PropDefinition[] = [createProp('value', 'string')];
    const after: PropDefinition[] = [createProp('value', 'number')];

    const changes = diffProps(before, after, 'Input');

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('type_changed');
    expect(changes[0].severity).toBe('warning');
  });

  it('detects default value changes', () => {
    const before: PropDefinition[] = [createProp('modal', 'boolean', false, 'true')];
    const after: PropDefinition[] = [createProp('modal', 'boolean', false, 'false')];

    const changes = diffProps(before, after, 'Dialog');

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('default_changed');
    expect(changes[0].severity).toBe('warning');
  });

  it('includes subComponent in changes when provided', () => {
    const before: PropDefinition[] = [createProp('open', 'boolean')];
    const after: PropDefinition[] = [];

    const changes = diffProps(before, after, 'Dialog', 'Content');

    expect(changes[0].subComponent).toBe('Content');
  });
});

describe('diffSubComponents', () => {
  it('detects added sub-components', () => {
    const before = [{ name: 'Root', props: [], isRequired: true }];
    const after = [
      { name: 'Root', props: [], isRequired: true },
      { name: 'Portal', props: [], isRequired: false },
    ];

    const changes = diffSubComponents(before, after, 'Dialog');

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('subcomponent_added');
    expect(changes[0].target).toBe('Portal');
    expect(changes[0].severity).toBe('info');
  });

  it('detects removed sub-components', () => {
    const before = [
      { name: 'Root', props: [], isRequired: true },
      { name: 'Overlay', props: [], isRequired: false },
    ];
    const after = [{ name: 'Root', props: [], isRequired: true }];

    const changes = diffSubComponents(before, after, 'Dialog');

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('subcomponent_removed');
    expect(changes[0].target).toBe('Overlay');
    expect(changes[0].severity).toBe('breaking');
  });

  it('detects prop changes within sub-components', () => {
    const before = [
      {
        name: 'Content',
        props: [createProp('side', '"left" | "right"')],
        isRequired: true,
      },
    ];
    const after = [
      {
        name: 'Content',
        props: [createProp('side', '"left" | "right" | "top"')],
        isRequired: true,
      },
    ];

    const changes = diffSubComponents(before, after, 'Popover');

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('type_widened');
    expect(changes[0].subComponent).toBe('Content');
  });
});

describe('diffContracts', () => {
  it('diffs full primitives', () => {
    const before = createPrimitive(
      'Dialog',
      [createProp('open', 'boolean'), createProp('allowPinchZoom', 'boolean')],
      [{ name: 'Content', props: [createProp('forceMount', 'true | undefined')] }]
    );

    const after = createPrimitive(
      'Dialog',
      [createProp('open', 'boolean'), createProp('modal', 'boolean')],
      [
        {
          name: 'Content',
          props: [createProp('forceMount', 'true | undefined')],
        },
        { name: 'Portal', props: [] },
      ]
    );

    const changes = diffContracts(before, after);

    // Should have: allowPinchZoom removed, modal added, Portal subcomponent added
    expect(changes.length).toBeGreaterThanOrEqual(3);

    const removed = changes.find(
      (c) => c.type === 'prop_removed' && c.target === 'allowPinchZoom'
    );
    const added = changes.find(
      (c) => c.type === 'prop_added' && c.target === 'modal'
    );
    const subAdded = changes.find(
      (c) => c.type === 'subcomponent_added' && c.target === 'Portal'
    );

    expect(removed).toBeDefined();
    expect(added).toBeDefined();
    expect(subAdded).toBeDefined();
  });

  it('returns no changes for identical primitives', () => {
    const primitive = createPrimitive(
      'Dialog',
      [createProp('open', 'boolean'), createProp('modal', 'boolean', false, 'true')],
      [{ name: 'Content', props: [createProp('forceMount', 'true | undefined')] }]
    );

    const changes = diffContracts(primitive, primitive);

    expect(changes).toHaveLength(0);
  });

  it('handles primitives with no props', () => {
    const before = createPrimitive('Empty', [], []);
    const after = createPrimitive('Empty', [], []);

    const changes = diffContracts(before, after);

    expect(changes).toHaveLength(0);
  });
});

describe('generateHint', () => {
  it('generates hint for prop removal', () => {
    const hint = generateHint('prop_removed', { target: 'allowPinchZoom' });
    expect(hint).toContain('Remove usage');
    expect(hint).toContain('allowPinchZoom');
  });

  it('generates hint for type narrowing', () => {
    const hint = generateHint('type_narrowed', {
      target: 'side',
      before: '"left" | "right" | "top"',
      after: '"left" | "right"',
    });
    expect(hint).toContain('narrowed');
    expect(hint).toContain('side');
  });

  it('generates hint for prop addition', () => {
    const hint = generateHint('prop_added', {
      target: 'modal',
      after: 'boolean',
    });
    expect(hint).toContain('New prop');
    expect(hint).toContain('modal');
  });
});

describe('generateDescription', () => {
  it('generates description with primitive context', () => {
    const desc = generateDescription('prop_removed', {
      target: 'open',
      primitive: 'Dialog',
    });
    expect(desc).toContain('[Dialog]');
    expect(desc).toContain('open');
    expect(desc).toContain('removed');
  });

  it('generates description with subComponent context', () => {
    const desc = generateDescription('prop_added', {
      target: 'side',
      primitive: 'Popover',
      subComponent: 'Content',
    });
    expect(desc).toContain('[Popover.Content]');
    expect(desc).toContain('side');
    expect(desc).toContain('added');
  });
});
