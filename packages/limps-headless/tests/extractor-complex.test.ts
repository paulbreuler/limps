/**
 * Tests for complex type parsing (GTC-005).
 * Handles ForwardRefExoticComponent, type aliases, and intersections.
 */

import { describe, it, expect } from 'vitest';
import { parseTypes } from '../src/extractor/index.js';
import {
  findForwardRefDeclarations,
  extractPropsFromForwardRef,
} from '../src/extractor/forward-ref.js';
import {
  resolveTypeAlias,
  mergeIntersectionTypes,
  filterReactInternals,
} from '../src/extractor/type-resolver.js';
import { extractSubComponentsEnhanced } from '../src/extractor/interface.js';

// Sample real-world .d.ts patterns
const FORWARD_REF_TYPES = `
import * as React from 'react';

export interface DialogRootProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children?: React.ReactNode;
}

export interface DialogTriggerProps {
  asChild?: boolean;
  children?: React.ReactNode;
}

export interface DialogContentProps {
  forceMount?: boolean;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  children?: React.ReactNode;
}

export interface DialogOverlayProps {
  forceMount?: boolean;
  children?: React.ReactNode;
}

export interface DialogPortalProps {
  container?: HTMLElement;
  forceMount?: boolean;
  children?: React.ReactNode;
}

export interface DialogTitleProps {
  children?: React.ReactNode;
}

export interface DialogDescriptionProps {
  children?: React.ReactNode;
}

export interface DialogCloseProps {
  asChild?: boolean;
  children?: React.ReactNode;
}

export const Dialog: React.FC<DialogRootProps>;
export const DialogRoot: React.ForwardRefExoticComponent<
  DialogRootProps & React.RefAttributes<HTMLDivElement>
>;
export const DialogTrigger: React.ForwardRefExoticComponent<
  DialogTriggerProps & React.RefAttributes<HTMLButtonElement>
>;
export const DialogContent: React.ForwardRefExoticComponent<
  DialogContentProps & React.RefAttributes<HTMLDivElement>
>;
export const DialogOverlay: React.ForwardRefExoticComponent<
  DialogOverlayProps & React.RefAttributes<HTMLDivElement>
>;
export const DialogPortal: React.FC<DialogPortalProps>;
export const DialogTitle: React.ForwardRefExoticComponent<
  DialogTitleProps & React.RefAttributes<HTMLHeadingElement>
>;
export const DialogDescription: React.ForwardRefExoticComponent<
  DialogDescriptionProps & React.RefAttributes<HTMLParagraphElement>
>;
export const DialogClose: React.ForwardRefExoticComponent<
  DialogCloseProps & React.RefAttributes<HTMLButtonElement>
>;
`;

const TYPE_ALIAS_TYPES = `
interface BaseDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
}

type DialogProps = BaseDialogProps & {
  modal?: boolean;
  onOpenChange?: (open: boolean) => void;
};

interface DialogContentImplProps {
  forceMount?: boolean;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
}

type DialogContentProps = DialogContentImplProps & {
  onPointerDownOutside?: (event: PointerEvent) => void;
};
`;

const INTERSECTION_TYPES = `
interface HTMLAttributes {
  className?: string;
  style?: object;
}

interface OwnProps {
  open?: boolean;
  modal?: boolean;
}

type DialogRootProps = OwnProps & HTMLAttributes & {
  onOpenChange?: (open: boolean) => void;
};
`;

describe('forward-ref', () => {
  describe('findForwardRefDeclarations', () => {
    it('finds ForwardRefExoticComponent type declarations', () => {
      const sourceFile = parseTypes(FORWARD_REF_TYPES);
      const declarations = findForwardRefDeclarations(sourceFile);

      expect(declarations.length).toBeGreaterThan(0);

      const dialogRoot = declarations.find((d) => d.name === 'DialogRoot');
      expect(dialogRoot).toBeDefined();
    });

    it('extracts component name from declaration', () => {
      const sourceFile = parseTypes(FORWARD_REF_TYPES);
      const declarations = findForwardRefDeclarations(sourceFile);

      const names = declarations.map((d) => d.name);
      expect(names).toContain('DialogRoot');
      expect(names).toContain('DialogTrigger');
      expect(names).toContain('DialogContent');
    });

    it('does not include React.FC components', () => {
      const sourceFile = parseTypes(FORWARD_REF_TYPES);
      const declarations = findForwardRefDeclarations(sourceFile);

      const names = declarations.map((d) => d.name);
      // DialogPortal uses React.FC, not ForwardRef
      expect(names).not.toContain('DialogPortal');
    });
  });

  describe('extractPropsFromForwardRef', () => {
    it('extracts props from ForwardRef type parameter', () => {
      const sourceFile = parseTypes(FORWARD_REF_TYPES);
      const declarations = findForwardRefDeclarations(sourceFile);
      const dialogRoot = declarations.find((d) => d.name === 'DialogRoot');

      expect(dialogRoot).toBeDefined();
      const props = extractPropsFromForwardRef(sourceFile, dialogRoot!);

      expect(props).toBeDefined();
      expect(props!.some((p) => p.name === 'open')).toBe(true);
      expect(props!.some((p) => p.name === 'onOpenChange')).toBe(true);
      expect(props!.some((p) => p.name === 'modal')).toBe(true);
    });

    it('filters out RefAttributes', () => {
      const sourceFile = parseTypes(FORWARD_REF_TYPES);
      const declarations = findForwardRefDeclarations(sourceFile);
      const dialogRoot = declarations.find((d) => d.name === 'DialogRoot');

      const props = extractPropsFromForwardRef(sourceFile, dialogRoot!);

      // Should not include ref from RefAttributes
      expect(props!.find((p) => p.name === 'ref')).toBeUndefined();
    });
  });
});

describe('type-resolver', () => {
  describe('resolveTypeAlias', () => {
    it('resolves type alias to merged properties', () => {
      const sourceFile = parseTypes(TYPE_ALIAS_TYPES);
      const resolved = resolveTypeAlias(sourceFile, 'DialogProps');

      expect(resolved).toBeDefined();
      expect(resolved!.length).toBeGreaterThan(0);

      // Should have props from BaseDialogProps
      expect(resolved!.some((p) => p.name === 'open')).toBe(true);
      expect(resolved!.some((p) => p.name === 'defaultOpen')).toBe(true);

      // Should have props from inline intersection
      expect(resolved!.some((p) => p.name === 'modal')).toBe(true);
      expect(resolved!.some((p) => p.name === 'onOpenChange')).toBe(true);
    });

    it('resolves nested type aliases', () => {
      const sourceFile = parseTypes(TYPE_ALIAS_TYPES);
      const resolved = resolveTypeAlias(sourceFile, 'DialogContentProps');

      expect(resolved).toBeDefined();
      expect(resolved!.some((p) => p.name === 'forceMount')).toBe(true);
      expect(resolved!.some((p) => p.name === 'onEscapeKeyDown')).toBe(true);
      expect(resolved!.some((p) => p.name === 'onPointerDownOutside')).toBe(true);
    });

    it('returns null for non-existent type', () => {
      const sourceFile = parseTypes(TYPE_ALIAS_TYPES);
      const resolved = resolveTypeAlias(sourceFile, 'NonExistentType');

      expect(resolved).toBeNull();
    });
  });

  describe('mergeIntersectionTypes', () => {
    it('merges intersection type members', () => {
      const sourceFile = parseTypes(INTERSECTION_TYPES);
      const typeAlias = sourceFile.getTypeAlias('DialogRootProps');

      expect(typeAlias).toBeDefined();
      const props = mergeIntersectionTypes(sourceFile, typeAlias!);

      expect(props.some((p) => p.name === 'open')).toBe(true);
      expect(props.some((p) => p.name === 'modal')).toBe(true);
      expect(props.some((p) => p.name === 'onOpenChange')).toBe(true);
    });
  });

  describe('filterReactInternals', () => {
    it('filters React internal props', () => {
      const props = [
        { name: 'open', type: 'boolean', required: false },
        { name: 'ref', type: 'React.Ref<HTMLDivElement>', required: false },
        { name: 'key', type: 'React.Key', required: false },
        { name: 'children', type: 'React.ReactNode', required: false },
      ];

      const filtered = filterReactInternals(props);

      expect(filtered).toHaveLength(2); // open, children
      expect(filtered.find((p) => p.name === 'ref')).toBeUndefined();
      expect(filtered.find((p) => p.name === 'key')).toBeUndefined();
      expect(filtered.find((p) => p.name === 'children')).toBeDefined();
      expect(filtered.find((p) => p.name === 'open')).toBeDefined();
    });

    it('keeps compositionally relevant props', () => {
      const props = [
        { name: 'children', type: 'React.ReactNode', required: false },
        { name: 'asChild', type: 'boolean', required: false },
      ];

      const filtered = filterReactInternals(props);

      expect(filtered).toHaveLength(2);
    });
  });
});

describe('extractSubComponentsEnhanced', () => {
  it('detects sub-components from ForwardRef exports', () => {
    const sourceFile = parseTypes(FORWARD_REF_TYPES);
    const subComponents = extractSubComponentsEnhanced(sourceFile, 'Dialog');

    expect(subComponents.length).toBeGreaterThan(0);

    const names = subComponents.map((s) => s.name);
    expect(names).toContain('Root');
    expect(names).toContain('Trigger');
    expect(names).toContain('Content');
    expect(names).toContain('Overlay');
    expect(names).toContain('Portal');
    expect(names).toContain('Title');
    expect(names).toContain('Description');
    expect(names).toContain('Close');
  });

  it('extracts props for each sub-component', () => {
    const sourceFile = parseTypes(FORWARD_REF_TYPES);
    const subComponents = extractSubComponentsEnhanced(sourceFile, 'Dialog');

    const content = subComponents.find((s) => s.name === 'Content');
    expect(content).toBeDefined();
    expect(content!.props.some((p) => p.name === 'forceMount')).toBe(true);
    expect(content!.props.some((p) => p.name === 'onEscapeKeyDown')).toBe(true);
  });

  it('handles primitives without ForwardRef exports', () => {
    const simpleTypes = `
export interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
}

export const Separator: React.FC<SeparatorProps>;
`;

    const sourceFile = parseTypes(simpleTypes);
    const subComponents = extractSubComponentsEnhanced(sourceFile, 'Separator');

    // Separator is a simple component with no sub-components
    // Should extract Root component via interface fallback
    expect(subComponents.length).toBe(1);
    expect(subComponents[0].name).toBe('Root');
    expect(subComponents[0].props).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'orientation' }),
        expect.objectContaining({ name: 'decorative' }),
      ])
    );
  });
});
