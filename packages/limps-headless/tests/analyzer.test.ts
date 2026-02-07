/**
 * Tests for the analyzer module.
 * TDD tests from agent 004 plan.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseComponent, getComponentNameFromPath } from '../src/analyzer/parser.js';
import { extractProps } from '../src/analyzer/props.js';
import {
  detectSubComponents,
  detectForwardRef,
  detectAsChild,
  inferStatePatternFromProps,
} from '../src/analyzer/patterns.js';
import { analyzeComponent } from '../src/analyzer/index.js';
import { scoreAgainstSignatures } from '../src/analyzer/scorer.js';
import {
  isAmbiguous,
  disambiguate,
  getDisambiguationReasoning,
} from '../src/analyzer/disambiguator.js';
import type { ComponentAnalysis, BehaviorSignature, PrimitiveMatch } from '../src/types/index.js';

// Create a temporary directory for test files
const TEST_DIR = path.join(os.tmpdir(), 'limps-headless-analyzer-test');

beforeEach(async () => {
  // Ensure test directory exists
  await fs.promises.mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
});

describe('analyzer/parser', () => {
  describe('parseComponent', () => {
    it('loads .tsx file and returns AST', async () => {
      const testFile = path.join(TEST_DIR, 'Modal.tsx');
      const content = `
interface ModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Modal({ open, onOpenChange }: ModalProps) {
  return <div>Modal</div>;
}
`;
      await fs.promises.writeFile(testFile, content, 'utf-8');

      const sourceFile = parseComponent(testFile);
      expect(sourceFile).not.toBeNull();
      expect(sourceFile?.getFilePath()).toContain('Modal.tsx');

      await fs.promises.unlink(testFile);
    });

    it('returns null for non-existent file', () => {
      const sourceFile = parseComponent('/nonexistent/file.tsx');
      expect(sourceFile).toBeNull();
    });
  });

  describe('getComponentNameFromPath', () => {
    it('extracts component name from file path', () => {
      expect(getComponentNameFromPath('/path/to/Modal.tsx')).toBe('Modal');
      expect(getComponentNameFromPath('Dialog.tsx')).toBe('Dialog');
      expect(getComponentNameFromPath('components/Button.tsx')).toBe('Button');
    });
  });
});

describe('analyzer/props', () => {
  describe('extractProps', () => {
    it('finds Props interface', async () => {
      const testFile = path.join(TEST_DIR, 'Modal.tsx');
      const content = `
interface ModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
}

export function Modal(props: ModalProps) {
  return <div>Modal</div>;
}
`;
      await fs.promises.writeFile(testFile, content, 'utf-8');
      const sourceFile = parseComponent(testFile);
      expect(sourceFile).not.toBeNull();

      if (sourceFile) {
        const props = extractProps(sourceFile, 'Modal');
        expect(props.has('open')).toBe(true);
        expect(props.has('onOpenChange')).toBe(true);
        expect(props.has('modal')).toBe(true);
      }

      await fs.promises.unlink(testFile);
    });

    it('finds inline props in function parameters', async () => {
      const testFile = path.join(TEST_DIR, 'Modal.tsx');
      const content = `
export function Modal({ open, onOpenChange }: { open: boolean; onOpenChange?: (open: boolean) => void }) {
  return <div>Modal</div>;
}
`;
      await fs.promises.writeFile(testFile, content, 'utf-8');
      const sourceFile = parseComponent(testFile);
      expect(sourceFile).not.toBeNull();

      if (sourceFile) {
        const props = extractProps(sourceFile, 'Modal');
        expect(props.has('open')).toBe(true);
        expect(props.has('onOpenChange')).toBe(true);
      }

      await fs.promises.unlink(testFile);
    });

    it('finds FC generic pattern', async () => {
      const testFile = path.join(TEST_DIR, 'Modal.tsx');
      const content = `
interface ModalProps {
  open?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ open }) => {
  return <div>Modal</div>;
};
`;
      await fs.promises.writeFile(testFile, content, 'utf-8');
      const sourceFile = parseComponent(testFile);
      expect(sourceFile).not.toBeNull();

      if (sourceFile) {
        const props = extractProps(sourceFile, 'Modal');
        expect(props.has('open')).toBe(true);
      }

      await fs.promises.unlink(testFile);
    });
  });
});

describe('analyzer/patterns', () => {
  describe('detectSubComponents', () => {
    it('finds Modal.Root pattern', async () => {
      const testFile = path.join(TEST_DIR, 'Modal.tsx');
      const content = `
export function Modal() {
  return <div>Modal</div>;
}

Modal.Root = function Root() {
  return <div>Root</div>;
};

Modal.Content = function Content() {
  return <div>Content</div>;
};
`;
      await fs.promises.writeFile(testFile, content, 'utf-8');
      const sourceFile = parseComponent(testFile);
      expect(sourceFile).not.toBeNull();

      if (sourceFile) {
        const subComponents = detectSubComponents(sourceFile, 'Modal');
        expect(subComponents).toContain('Root');
        expect(subComponents).toContain('Content');
      }

      await fs.promises.unlink(testFile);
    });

    it('finds compound export pattern', async () => {
      const testFile = path.join(TEST_DIR, 'Modal.tsx');
      const content = `
export function Root() {
  return <div>Root</div>;
}

export function Trigger() {
  return <div>Trigger</div>;
}

export function Content() {
  return <div>Content</div>;
}
`;
      await fs.promises.writeFile(testFile, content, 'utf-8');
      const sourceFile = parseComponent(testFile);
      expect(sourceFile).not.toBeNull();

      if (sourceFile) {
        const subComponents = detectSubComponents(sourceFile, 'Modal');
        // Should detect common sub-component names
        expect(subComponents.length).toBeGreaterThan(0);
      }

      await fs.promises.unlink(testFile);
    });
  });

  describe('detectForwardRef', () => {
    it('detects forwardRef usage', async () => {
      const testFile = path.join(TEST_DIR, 'Modal.tsx');
      const content = `
import { forwardRef } from 'react';

export const Modal = forwardRef<HTMLDivElement, ModalProps>((props, ref) => {
  return <div ref={ref}>Modal</div>;
});
`;
      await fs.promises.writeFile(testFile, content, 'utf-8');
      const sourceFile = parseComponent(testFile);
      expect(sourceFile).not.toBeNull();

      if (sourceFile) {
        const usesForwardRef = detectForwardRef(sourceFile);
        expect(usesForwardRef).toBe(true);
      }

      await fs.promises.unlink(testFile);
    });
  });

  describe('detectAsChild', () => {
    it('detects asChild prop', async () => {
      const testFile = path.join(TEST_DIR, 'Modal.tsx');
      const content = `
interface ModalProps {
  asChild?: boolean;
}

export function Modal(props: ModalProps) {
  return <div>Modal</div>;
}
`;
      await fs.promises.writeFile(testFile, content, 'utf-8');
      const sourceFile = parseComponent(testFile);
      expect(sourceFile).not.toBeNull();

      if (sourceFile) {
        const props = extractProps(sourceFile, 'Modal');
        const hasAsChild = detectAsChild(sourceFile, props);
        expect(hasAsChild).toBe(true);
      }

      await fs.promises.unlink(testFile);
    });
  });

  describe('inferStatePatternFromProps', () => {
    it('infers binary pattern from open/onOpenChange', async () => {
      const testFile = path.join(TEST_DIR, 'Modal.tsx');
      const content = `
interface ModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Modal(props: ModalProps) {
  return <div>Modal</div>;
}
`;
      await fs.promises.writeFile(testFile, content, 'utf-8');
      const sourceFile = parseComponent(testFile);
      expect(sourceFile).not.toBeNull();

      if (sourceFile) {
        const props = extractProps(sourceFile, 'Modal');
        const pattern = inferStatePatternFromProps(props);
        expect(pattern).toBe('binary');
      }

      await fs.promises.unlink(testFile);
    });
  });
});

describe('analyzer/scorer', () => {
  describe('scoreAgainstSignatures', () => {
    it('scores statePattern: binary match → 35', () => {
      const analysis: ComponentAnalysis = {
        name: 'TestComponent',
        filePath: '/test.tsx',
        propsInterface: new Map(),
        subComponents: [],
        inferredStatePattern: 'binary',
        inferredCompositionPattern: 'compound',
        inferredRenderingPattern: 'portal-conditional',
        usesForwardRef: false,
        hasAsChild: false,
        ariaRoles: [],
        dataAttributes: [],
      };

      // Set up props for binary pattern
      const openProp = {
        name: 'open',
        type: 'boolean',
        required: false,
        isStateControl: true,
        isEventHandler: false,
        isConfiguration: false,
        isComposition: false,
      };
      analysis.propsInterface.set('open', openProp);
      analysis.propsInterface.set('onOpenChange', {
        ...openProp,
        name: 'onOpenChange',
        isStateControl: false,
        isEventHandler: true,
      });

      const signature: BehaviorSignature = {
        primitive: 'Dialog',
        package: '@radix-ui/react-dialog',
        version: '1.0.0',
        statePattern: 'binary',
        compositionPattern: 'compound',
        renderingPattern: 'portal-conditional',
        distinguishingProps: ['modal'],
        antiPatternProps: [],
        subComponents: [],
        similarTo: [],
      };

      const matches = scoreAgainstSignatures(analysis, [signature]);
      expect(matches.length).toBe(1);
      expect(matches[0].breakdown.statePatternScore).toBe(35);
    });

    it('scores composition: compound match → 25', () => {
      const analysis: ComponentAnalysis = {
        name: 'TestComponent',
        filePath: '/test.tsx',
        propsInterface: new Map(),
        subComponents: ['Root', 'Trigger', 'Content'],
        inferredStatePattern: 'binary',
        inferredCompositionPattern: 'compound',
        inferredRenderingPattern: 'portal-conditional',
        usesForwardRef: false,
        hasAsChild: false,
        ariaRoles: [],
        dataAttributes: [],
      };

      const signature: BehaviorSignature = {
        primitive: 'Dialog',
        package: '@radix-ui/react-dialog',
        version: '1.0.0',
        statePattern: 'binary',
        compositionPattern: 'compound',
        renderingPattern: 'portal-conditional',
        distinguishingProps: ['modal'],
        antiPatternProps: [],
        subComponents: [],
        similarTo: [],
      };

      const matches = scoreAgainstSignatures(analysis, [signature]);
      expect(matches[0].breakdown.compositionScore).toBe(25);
    });

    it('scores props: modal found → +points', () => {
      const analysis: ComponentAnalysis = {
        name: 'TestComponent',
        filePath: '/test.tsx',
        propsInterface: new Map(),
        subComponents: [],
        inferredStatePattern: 'binary',
        inferredCompositionPattern: 'compound',
        inferredRenderingPattern: 'portal-conditional',
        usesForwardRef: false,
        hasAsChild: false,
        ariaRoles: [],
        dataAttributes: [],
      };

      analysis.propsInterface.set('modal', {
        name: 'modal',
        type: 'boolean',
        required: false,
        isStateControl: false,
        isEventHandler: false,
        isConfiguration: true,
        isComposition: false,
      });

      const signature: BehaviorSignature = {
        primitive: 'Dialog',
        package: '@radix-ui/react-dialog',
        version: '1.0.0',
        statePattern: 'binary',
        compositionPattern: 'compound',
        renderingPattern: 'portal-conditional',
        distinguishingProps: ['modal'],
        antiPatternProps: [],
        subComponents: [],
        similarTo: [],
      };

      const matches = scoreAgainstSignatures(analysis, [signature]);
      expect(matches[0].breakdown.propsSignatureScore).toBe(20); // Full score for matching distinguishing prop
    });

    it('applies antiPatternPenalty: delayDuration → -points', () => {
      const analysis: ComponentAnalysis = {
        name: 'TestComponent',
        filePath: '/test.tsx',
        propsInterface: new Map(),
        subComponents: [],
        inferredStatePattern: 'binary',
        inferredCompositionPattern: 'compound',
        inferredRenderingPattern: 'portal-conditional',
        usesForwardRef: false,
        hasAsChild: false,
        ariaRoles: [],
        dataAttributes: [],
      };

      analysis.propsInterface.set('delayDuration', {
        name: 'delayDuration',
        type: 'number',
        required: false,
        isStateControl: false,
        isEventHandler: false,
        isConfiguration: false,
        isComposition: false,
      });

      const signature: BehaviorSignature = {
        primitive: 'Dialog',
        package: '@radix-ui/react-dialog',
        version: '1.0.0',
        statePattern: 'binary',
        compositionPattern: 'compound',
        renderingPattern: 'portal-conditional',
        distinguishingProps: ['modal'],
        antiPatternProps: ['delayDuration'], // This prop indicates NOT Dialog
        subComponents: [],
        similarTo: [],
      };

      const matches = scoreAgainstSignatures(analysis, [signature]);
      // Should have penalty applied (10 points per anti-pattern)
      expect(matches[0].confidence).toBeLessThan(100);
    });

    it('aggregates score: sum 0-100 with breakdown', () => {
      const analysis: ComponentAnalysis = {
        name: 'TestComponent',
        filePath: '/test.tsx',
        propsInterface: new Map(),
        subComponents: ['Root', 'Trigger', 'Content'],
        inferredStatePattern: 'binary',
        inferredCompositionPattern: 'compound',
        inferredRenderingPattern: 'portal-conditional',
        usesForwardRef: true,
        hasAsChild: true,
        ariaRoles: ['dialog'],
        dataAttributes: ['data-state'],
      };

      analysis.propsInterface.set('modal', {
        name: 'modal',
        type: 'boolean',
        required: false,
        isStateControl: false,
        isEventHandler: false,
        isConfiguration: true,
        isComposition: false,
      });

      const signature: BehaviorSignature = {
        primitive: 'Dialog',
        package: '@radix-ui/react-dialog',
        version: '1.0.0',
        statePattern: 'binary',
        compositionPattern: 'compound',
        renderingPattern: 'portal-conditional',
        distinguishingProps: ['modal'],
        antiPatternProps: [],
        subComponents: [],
        similarTo: [],
      };

      const matches = scoreAgainstSignatures(analysis, [signature]);
      const match = matches[0];

      expect(match.confidence).toBeGreaterThanOrEqual(0);
      expect(match.confidence).toBeLessThanOrEqual(100);
      expect(match.breakdown.statePatternScore).toBe(35);
      expect(match.breakdown.compositionScore).toBe(25);
      expect(match.breakdown.propsSignatureScore).toBe(20);
      expect(match.breakdown.accessibilityScore).toBeGreaterThan(0);
      expect(match.breakdown.renderingScore).toBe(10);
    });
  });
});

describe('analyzer/disambiguator', () => {
  describe('isAmbiguous', () => {
    it('returns true when top 2 within 10 points', () => {
      const matches: PrimitiveMatch[] = [
        {
          primitive: 'Dialog',
          package: '@radix-ui/react-dialog',
          confidence: 55,
          breakdown: {
            statePatternScore: 35,
            compositionScore: 20,
            propsSignatureScore: 0,
            accessibilityScore: 0,
            renderingScore: 0,
          },
          signals: { matched: [], missing: [], antiPatterns: [] },
        },
        {
          primitive: 'Popover',
          package: '@radix-ui/react-popover',
          confidence: 50, // Within 10 points
          breakdown: {
            statePatternScore: 35,
            compositionScore: 15,
            propsSignatureScore: 0,
            accessibilityScore: 0,
            renderingScore: 0,
          },
          signals: { matched: [], missing: [], antiPatterns: [] },
        },
      ];

      expect(isAmbiguous(matches)).toBe(true);
    });

    it('returns false when top 2 more than 10 points apart', () => {
      const matches: PrimitiveMatch[] = [
        {
          primitive: 'Dialog',
          package: '@radix-ui/react-dialog',
          confidence: 60,
          breakdown: {
            statePatternScore: 35,
            compositionScore: 25,
            propsSignatureScore: 0,
            accessibilityScore: 0,
            renderingScore: 0,
          },
          signals: { matched: [], missing: [], antiPatterns: [] },
        },
        {
          primitive: 'Popover',
          package: '@radix-ui/react-popover',
          confidence: 45, // More than 10 points apart
          breakdown: {
            statePatternScore: 35,
            compositionScore: 10,
            propsSignatureScore: 0,
            accessibilityScore: 0,
            renderingScore: 0,
          },
          signals: { matched: [], missing: [], antiPatterns: [] },
        },
      ];

      expect(isAmbiguous(matches)).toBe(false);
    });
  });

  describe('disambiguate', () => {
    it('Dialog vs Popover: modal → Dialog', () => {
      const analysis: ComponentAnalysis = {
        name: 'TestComponent',
        filePath: '/test.tsx',
        propsInterface: new Map(),
        subComponents: [],
        inferredStatePattern: 'binary',
        inferredCompositionPattern: 'compound',
        inferredRenderingPattern: 'portal-conditional',
        usesForwardRef: false,
        hasAsChild: false,
        ariaRoles: [],
        dataAttributes: [],
      };

      analysis.propsInterface.set('modal', {
        name: 'modal',
        type: 'boolean',
        required: false,
        isStateControl: false,
        isEventHandler: false,
        isConfiguration: true,
        isComposition: false,
      });

      const matches: PrimitiveMatch[] = [
        {
          primitive: 'Dialog',
          package: '@radix-ui/react-dialog',
          confidence: 55,
          breakdown: {
            statePatternScore: 35,
            compositionScore: 20,
            propsSignatureScore: 0,
            accessibilityScore: 0,
            renderingScore: 0,
          },
          signals: { matched: [], missing: [], antiPatterns: [] },
        },
        {
          primitive: 'Popover',
          package: '@radix-ui/react-popover',
          confidence: 50,
          breakdown: {
            statePatternScore: 35,
            compositionScore: 15,
            propsSignatureScore: 0,
            accessibilityScore: 0,
            renderingScore: 0,
          },
          signals: { matched: [], missing: [], antiPatterns: [] },
        },
      ];

      const result = disambiguate(matches, analysis);
      expect(result.primitive).toBe('Dialog');
    });

    it('Tooltip vs HoverCard: delayDuration → Tooltip', () => {
      const analysis: ComponentAnalysis = {
        name: 'TestComponent',
        filePath: '/test.tsx',
        propsInterface: new Map(),
        subComponents: [],
        inferredStatePattern: 'binary',
        inferredCompositionPattern: 'compound',
        inferredRenderingPattern: 'portal',
        usesForwardRef: false,
        hasAsChild: false,
        ariaRoles: [],
        dataAttributes: [],
      };

      analysis.propsInterface.set('delayDuration', {
        name: 'delayDuration',
        type: 'number',
        required: false,
        isStateControl: false,
        isEventHandler: false,
        isConfiguration: false,
        isComposition: false,
      });

      const matches: PrimitiveMatch[] = [
        {
          primitive: 'Tooltip',
          package: '@radix-ui/react-tooltip',
          confidence: 55,
          breakdown: {
            statePatternScore: 35,
            compositionScore: 20,
            propsSignatureScore: 0,
            accessibilityScore: 0,
            renderingScore: 0,
          },
          signals: { matched: [], missing: [], antiPatterns: [] },
        },
        {
          primitive: 'HoverCard',
          package: '@radix-ui/react-hover-card',
          confidence: 50,
          breakdown: {
            statePatternScore: 35,
            compositionScore: 15,
            propsSignatureScore: 0,
            accessibilityScore: 0,
            renderingScore: 0,
          },
          signals: { matched: [], missing: [], antiPatterns: [] },
        },
      ];

      const result = disambiguate(matches, analysis);
      expect(result.primitive).toBe('Tooltip');
    });

    it('Checkbox vs Switch: Thumb → Switch', () => {
      const analysis: ComponentAnalysis = {
        name: 'TestComponent',
        filePath: '/test.tsx',
        propsInterface: new Map(),
        subComponents: ['Thumb'],
        inferredStatePattern: 'binary',
        inferredCompositionPattern: 'monolithic',
        inferredRenderingPattern: 'inline',
        usesForwardRef: false,
        hasAsChild: false,
        ariaRoles: [],
        dataAttributes: [],
      };

      const matches: PrimitiveMatch[] = [
        {
          primitive: 'Checkbox',
          package: '@radix-ui/react-checkbox',
          confidence: 55,
          breakdown: {
            statePatternScore: 35,
            compositionScore: 25,
            propsSignatureScore: 0,
            accessibilityScore: 0,
            renderingScore: 0,
          },
          signals: { matched: [], missing: [], antiPatterns: [] },
        },
        {
          primitive: 'Switch',
          package: '@radix-ui/react-switch',
          confidence: 50,
          breakdown: {
            statePatternScore: 35,
            compositionScore: 25,
            propsSignatureScore: 0,
            accessibilityScore: 0,
            renderingScore: 0,
          },
          signals: { matched: [], missing: [], antiPatterns: [] },
        },
      ];

      const result = disambiguate(matches, analysis);
      expect(result.primitive).toBe('Switch');
    });

    it('returns reasoning', () => {
      const analysis: ComponentAnalysis = {
        name: 'TestComponent',
        filePath: '/test.tsx',
        propsInterface: new Map(),
        subComponents: [],
        inferredStatePattern: 'binary',
        inferredCompositionPattern: 'compound',
        inferredRenderingPattern: 'portal-conditional',
        usesForwardRef: false,
        hasAsChild: false,
        ariaRoles: [],
        dataAttributes: [],
      };

      analysis.propsInterface.set('modal', {
        name: 'modal',
        type: 'boolean',
        required: false,
        isStateControl: false,
        isEventHandler: false,
        isConfiguration: true,
        isComposition: false,
      });

      const matches: PrimitiveMatch[] = [
        {
          primitive: 'Dialog',
          package: '@radix-ui/react-dialog',
          confidence: 55,
          breakdown: {
            statePatternScore: 35,
            compositionScore: 20,
            propsSignatureScore: 0,
            accessibilityScore: 0,
            renderingScore: 0,
          },
          signals: { matched: [], missing: [], antiPatterns: [] },
        },
        {
          primitive: 'Popover',
          package: '@radix-ui/react-popover',
          confidence: 50,
          breakdown: {
            statePatternScore: 35,
            compositionScore: 15,
            propsSignatureScore: 0,
            accessibilityScore: 0,
            renderingScore: 0,
          },
          signals: { matched: [], missing: [], antiPatterns: [] },
        },
      ];

      const result = disambiguate(matches, analysis);
      const reasoning = getDisambiguationReasoning(matches, analysis, result);

      // Reasoning is only returned when the chosen match is NOT the top match
      // In this case, Dialog is the top match and was chosen, so reasoning is undefined
      // This is expected behavior - reasoning explains why a lower-scored match was chosen
      expect(reasoning).toBeUndefined();
    });
  });
});

describe('tools/analyze-component', () => {
  it('rejects paths outside the project', async () => {
    const { handleAnalyzeComponent } = await import('../src/tools/analyze-component.js');
    const outsidePath = path.join(os.tmpdir(), 'outside.tsx');
    await fs.promises.writeFile(outsidePath, 'export const x = 1;', 'utf-8');

    await expect(handleAnalyzeComponent({ filePath: outsidePath })).rejects.toThrow(
      'filePath must be within the project directory'
    );

    await fs.promises.unlink(outsidePath);
  });

  it('rejects non-.ts/.tsx files', async () => {
    const { handleAnalyzeComponent } = await import('../src/tools/analyze-component.js');
    const testDir = path.join(process.cwd(), 'tests', 'tmp-analyze');
    await fs.promises.mkdir(testDir, { recursive: true });
    const testFile = path.join(testDir, 'Component.js');
    await fs.promises.writeFile(testFile, 'export const x = 1;', 'utf-8');

    try {
      await expect(handleAnalyzeComponent({ filePath: testFile })).rejects.toThrow(
        'filePath must point to a .ts or .tsx file'
      );
    } finally {
      await fs.promises.unlink(testFile).catch(() => undefined);
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});

describe('analyzer/index', () => {
  describe('analyzeComponent', () => {
    it('analyzes component and returns ComponentAnalysis', async () => {
      const testFile = path.join(TEST_DIR, 'Modal.tsx');
      const content = `
interface ModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
}

export function Modal(props: ModalProps) {
  return <div>Modal</div>;
}

Modal.Root = function Root() {
  return <div>Root</div>;
};
`;
      await fs.promises.writeFile(testFile, content, 'utf-8');

      const analysis = await analyzeComponent(testFile);

      expect(analysis.name).toBe('Modal');
      expect(analysis.filePath).toBe(testFile);
      expect(analysis.propsInterface.has('open')).toBe(true);
      expect(analysis.subComponents).toContain('Root');
      expect(analysis.inferredStatePattern).toBe('binary');

      await fs.promises.unlink(testFile);
    });
  });
});
