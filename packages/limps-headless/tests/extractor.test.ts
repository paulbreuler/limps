/**
 * Tests for the extractor module.
 * TDD tests from agent 001 plan.
 */

import { describe, it, expect } from 'vitest';
import {
  parseTypes,
  findInterfaces,
  findPropsInterfaces,
  extractPropsFromInterface,
  extractSubComponents,
  extractPrimitive,
} from '../src/extractor/index.js';
import {
  classifyProp,
  isStateControl,
  isEventHandler,
  isComposition,
  isConfiguration,
  getPropCategory,
} from '../src/extractor/classifier.js';

// Sample .d.ts content for testing
const SAMPLE_DIALOG_TYPES = `
export interface DialogProps {
  /** The controlled open state */
  open?: boolean;
  /** Callback when open changes */
  onOpenChange?: (open: boolean) => void;
  /** Whether the dialog is modal */
  modal?: boolean;
  children?: React.ReactNode;
}

export interface DialogTriggerProps {
  /** Render as child element */
  asChild?: boolean;
  children?: React.ReactNode;
}

export interface DialogContentProps {
  /** Force content to stay mounted */
  forceMount?: boolean;
  /** Called when escape key is pressed */
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  /** Called when pointer down outside */
  onPointerDownOutside?: (event: PointerEvent) => void;
  children?: React.ReactNode;
}

export interface DialogRootProps extends DialogProps {}

export const Root: React.FC<DialogRootProps>;
export const Trigger: React.FC<DialogTriggerProps>;
export const Content: React.FC<DialogContentProps>;
`;

describe('extractor/project', () => {
  describe('parseTypes', () => {
    it('parses type content into source file', () => {
      const sourceFile = parseTypes(SAMPLE_DIALOG_TYPES);
      expect(sourceFile).toBeDefined();
      expect(sourceFile.getFilePath()).toContain('index.d.ts');
    });
  });
});

describe('extractor/interface', () => {
  describe('findInterfaces', () => {
    it('finds all interfaces in source file', () => {
      const sourceFile = parseTypes(SAMPLE_DIALOG_TYPES);
      const interfaces = findInterfaces(sourceFile);

      expect(interfaces.length).toBeGreaterThan(0);
      expect(interfaces.map((i) => i.getName())).toContain('DialogProps');
    });
  });

  describe('findPropsInterfaces', () => {
    it('filters to only *Props interfaces', () => {
      const sourceFile = parseTypes(SAMPLE_DIALOG_TYPES);
      const propsInterfaces = findPropsInterfaces(sourceFile);

      expect(propsInterfaces.every((i) => i.getName().endsWith('Props'))).toBe(true);
    });
  });

  describe('extractSubComponents', () => {
    it('extracts sub-components by naming pattern', () => {
      const sourceFile = parseTypes(SAMPLE_DIALOG_TYPES);
      const subComponents = extractSubComponents(sourceFile, 'Dialog');

      expect(subComponents.length).toBeGreaterThan(0);

      const trigger = subComponents.find((s) => s.name === 'Trigger');
      expect(trigger).toBeDefined();
      expect(trigger?.props.some((p) => p.name === 'asChild')).toBe(true);

      const content = subComponents.find((s) => s.name === 'Content');
      expect(content).toBeDefined();
    });
  });
});

describe('extractor/props', () => {
  describe('extractPropsFromInterface', () => {
    it('extracts props with name, type, required', () => {
      const sourceFile = parseTypes(SAMPLE_DIALOG_TYPES);
      const dialogProps = sourceFile.getInterface('DialogProps');
      expect(dialogProps).toBeDefined();

      const props = extractPropsFromInterface(dialogProps!);

      const openProp = props.find((p) => p.name === 'open');
      expect(openProp).toBeDefined();
      expect(openProp?.type).toContain('boolean');
      expect(openProp?.required).toBe(false); // has question token

      const onOpenChange = props.find((p) => p.name === 'onOpenChange');
      expect(onOpenChange).toBeDefined();
      expect(onOpenChange?.type).toContain('boolean');
    });

    it('handles interface extends', () => {
      const sourceFile = parseTypes(SAMPLE_DIALOG_TYPES);
      const rootProps = sourceFile.getInterface('DialogRootProps');
      expect(rootProps).toBeDefined();

      const props = extractPropsFromInterface(rootProps!);

      // Should include props from DialogProps via extends
      expect(props.some((p) => p.name === 'open')).toBe(true);
    });
  });
});

describe('extractor/classifier', () => {
  describe('isStateControl', () => {
    it('identifies state control props', () => {
      expect(isStateControl('open')).toBe(true);
      expect(isStateControl('value')).toBe(true);
      expect(isStateControl('checked')).toBe(true);
      expect(isStateControl('defaultOpen')).toBe(true);
      expect(isStateControl('className')).toBe(false);
    });
  });

  describe('isEventHandler', () => {
    it('identifies event handlers by on[A-Z] pattern', () => {
      expect(isEventHandler('onOpenChange')).toBe(true);
      expect(isEventHandler('onValueChange')).toBe(true);
      expect(isEventHandler('onClick')).toBe(true);
      expect(isEventHandler('open')).toBe(false);
      expect(isEventHandler('onchange')).toBe(false); // lowercase
    });
  });

  describe('isComposition', () => {
    it('identifies composition props', () => {
      expect(isComposition('asChild')).toBe(true);
      expect(isComposition('children')).toBe(true);
      expect(isComposition('className')).toBe(false);
    });
  });

  describe('isConfiguration', () => {
    it('identifies configuration props', () => {
      expect(isConfiguration('modal')).toBe(true);
      expect(isConfiguration('orientation')).toBe(true);
      expect(isConfiguration('side')).toBe(true);
      expect(isConfiguration('open')).toBe(false);
    });
  });

  describe('getPropCategory', () => {
    it('returns correct category', () => {
      expect(getPropCategory('open')).toBe('state');
      expect(getPropCategory('onOpenChange')).toBe('event');
      expect(getPropCategory('asChild')).toBe('composition');
      expect(getPropCategory('modal')).toBe('config');
      expect(getPropCategory('customProp')).toBe('other');
    });
  });

  describe('classifyProp', () => {
    it('classifies raw prop into full PropDefinition', () => {
      const classified = classifyProp({
        name: 'open',
        type: 'boolean',
        required: false,
      });

      expect(classified.isStateControl).toBe(true);
      expect(classified.isEventHandler).toBe(false);
      expect(classified.isComposition).toBe(false);
      expect(classified.isConfiguration).toBe(false);
    });
  });
});

describe('extractPrimitive', () => {
  it('extracts complete primitive from type content', () => {
    const primitive = extractPrimitive(SAMPLE_DIALOG_TYPES, 'Dialog', '1.0.5');

    expect(primitive.name).toBe('Dialog');
    expect(primitive.package).toBe('@radix-ui/react-dialog');
    expect(primitive.version).toBe('1.0.5');
    expect(primitive.extractedAt).toBeDefined();

    // Should have sub-components
    expect(primitive.subComponents.length).toBeGreaterThan(0);

    // Root props should include state props
    const hasOpenProp = primitive.rootProps.some((p) => p.name === 'open');
    expect(hasOpenProp || primitive.subComponents.some((s) => s.name === 'Root')).toBe(true);
  });
});
