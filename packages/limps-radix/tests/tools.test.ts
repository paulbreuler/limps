/**
 * Tests for MCP tools.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listPrimitivesTool,
  handleListPrimitives,
  extractPrimitiveTool,
  handleExtractPrimitive,
} from '../src/tools/index.js';

// Mock the fetcher module
vi.mock('../src/fetcher/index.js', () => ({
  resolveVersion: vi.fn().mockResolvedValue('1.1.2'),
  listPrimitives: vi.fn().mockResolvedValue([
    { name: 'dialog', package: '@radix-ui/react-dialog', description: 'A modal dialog overlay' },
    { name: 'popover', package: '@radix-ui/react-popover', description: 'A popup that appears from a trigger' },
  ]),
  fetchTypes: vi.fn().mockResolvedValue('export interface DialogProps { open?: boolean; }'),
  primitiveToPackage: vi.fn().mockImplementation((p: string) => `@radix-ui/react-${p}`),
}));

// Mock the extractor module
vi.mock('../src/extractor/index.js', () => ({
  extractPrimitive: vi.fn().mockReturnValue({
    name: 'Dialog',
    package: '@radix-ui/react-dialog',
    version: '1.1.2',
    extractedAt: new Date().toISOString(),
    rootProps: [],
    subComponents: [
      {
        name: 'Root',
        props: [
          { name: 'open', type: 'boolean', required: false },
          { name: 'onOpenChange', type: '(open: boolean) => void', required: false },
        ],
        isRequired: true,
      },
      {
        name: 'Trigger',
        props: [{ name: 'asChild', type: 'boolean', required: false }],
        isRequired: true,
      },
    ],
    exports: ['Dialog', 'Root', 'Trigger', 'Content'],
    usesContext: true,
  }),
  getPropCategory: vi.fn().mockImplementation((name: string) => {
    if (name === 'open') return 'state';
    if (name.startsWith('on')) return 'event';
    if (name === 'asChild') return 'composition';
    return 'other';
  }),
}));

// Mock the signatures module
vi.mock('../src/signatures/index.js', () => ({
  generateSignature: vi.fn().mockReturnValue({
    primitive: 'Dialog',
    package: '@radix-ui/react-dialog',
    version: '1.1.2',
    statePattern: 'binary',
    compositionPattern: 'compound',
    renderingPattern: 'portal-conditional',
    distinguishingProps: ['modal', 'open'],
    antiPatternProps: [],
    subComponents: [
      { name: 'Root', role: 'other', required: true },
      { name: 'Trigger', role: 'trigger', required: true },
    ],
    similarTo: ['AlertDialog', 'Popover'],
    disambiguationRule: 'Dialog has modal=true by default; AlertDialog requires action confirmation',
  }),
}));

// Mock the cache module
vi.mock('../src/cache/index.js', () => ({
  getFromCache: vi.fn().mockResolvedValue(null),
  saveToCache: vi.fn().mockResolvedValue(undefined),
  getSignatureFromCache: vi.fn().mockResolvedValue(null),
  saveSignatureToCache: vi.fn().mockResolvedValue(undefined),
}));

describe('tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listPrimitivesTool', () => {
    it('has correct tool definition', () => {
      expect(listPrimitivesTool.name).toBe('radix_list_primitives');
      expect(listPrimitivesTool.description).toContain('List all available Radix UI primitives');
      expect(listPrimitivesTool.inputSchema).toBeDefined();
      expect(listPrimitivesTool.handler).toBeDefined();
    });

    it('input schema validates correctly', () => {
      const schema = listPrimitivesTool.inputSchema;
      const valid1 = schema.parse({});
      expect(valid1.version).toBe('latest');

      const valid2 = schema.parse({ version: '1.0.0' });
      expect(valid2.version).toBe('1.0.0');
    });

    it('handler returns primitives list', async () => {
      const result = await handleListPrimitives({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.version).toBe('1.1.2');
      expect(parsed.primitives).toHaveLength(2);
      expect(parsed.primitives[0].name).toBe('dialog');
    });
  });

  describe('extractPrimitiveTool', () => {
    it('has correct tool definition', () => {
      expect(extractPrimitiveTool.name).toBe('radix_extract_primitive');
      expect(extractPrimitiveTool.description).toContain('behavioral contract');
      expect(extractPrimitiveTool.inputSchema).toBeDefined();
      expect(extractPrimitiveTool.handler).toBeDefined();
    });

    it('input schema requires primitive', () => {
      const schema = extractPrimitiveTool.inputSchema;
      expect(() => schema.parse({})).toThrow();

      const valid = schema.parse({ primitive: 'dialog' });
      expect(valid.primitive).toBe('dialog');
      expect(valid.version).toBe('latest');
    });

    it('handler returns primitive contract', async () => {
      const result = await handleExtractPrimitive({ primitive: 'dialog' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.primitive).toBe('Dialog');
      expect(parsed.package).toBe('@radix-ui/react-dialog');
      expect(parsed.version).toBe('1.1.2');
      expect(parsed.behavior.statePattern).toBe('binary');
      expect(parsed.behavior.compositionPattern).toBe('compound');
      expect(parsed.subComponents).toHaveLength(2);
      expect(parsed.similarTo).toContain('AlertDialog');
    });

    it('categorizes props correctly', async () => {
      const result = await handleExtractPrimitive({ primitive: 'dialog' });
      const parsed = JSON.parse(result.content[0].text);

      const rootProps = parsed.subComponents.find((sc: { name: string }) => sc.name === 'Root')?.props;
      expect(rootProps).toBeDefined();

      const openProp = rootProps.find((p: { name: string }) => p.name === 'open');
      expect(openProp?.category).toBe('state');

      const onChangeProp = rootProps.find((p: { name: string }) => p.name === 'onOpenChange');
      expect(onChangeProp?.category).toBe('event');
    });
  });
});
