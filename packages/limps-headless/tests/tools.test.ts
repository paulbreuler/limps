/**
 * Tests for headless_list_primitives and headless_extract_primitive.
 *
 * We test:
 * - Happy path: radix provider returns version and primitives; extract returns contract.
 * - Expected behavior: unified package name when source is unified; custom provider path.
 * - Failure modes: custom provider resolveVersion or listPrimitives throws (propagates).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listPrimitivesTool,
  handleListPrimitives,
  extractPrimitiveTool,
  handleExtractPrimitive,
} from '../src/tools/index.js';
import { registerProvider } from '../src/providers/registry.js';

const mockResolvePackage = vi.fn();
const mockListPrimitives = vi.fn();

// Mock the fetcher module
vi.mock('../src/fetcher/index.js', () => ({
  resolvePackage: (...args: unknown[]) => mockResolvePackage(...args),
  listPrimitives: (...args: unknown[]) => mockListPrimitives(...args),
  fetchTypesWithFallback: vi.fn().mockResolvedValue({
    resolved: {
      source: 'individual',
      packageName: '@radix-ui/react-dialog',
      primitive: 'dialog',
      version: '1.1.2',
      typesPath: 'dist/index.d.ts',
    },
    content: 'export interface DialogProps { open?: boolean; }',
  }),
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
    disambiguationRule:
      'Dialog has modal=true by default; AlertDialog requires action confirmation',
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
    mockResolvePackage.mockResolvedValue({
      source: 'individual',
      packageName: '@radix-ui/react-dialog',
      primitive: 'dialog',
      version: '1.1.2',
      typesPath: 'dist/index.d.ts',
    });
    mockListPrimitives.mockResolvedValue([
      {
        name: 'dialog',
        package: '@radix-ui/react-dialog',
        description: 'A modal dialog overlay',
      },
      {
        name: 'popover',
        package: '@radix-ui/react-popover',
        description: 'A popup that appears from a trigger',
      },
    ]);
  });

  describe('listPrimitivesTool', () => {
    it('has correct tool definition', () => {
      expect(listPrimitivesTool.name).toBe('headless_list_primitives');
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

    it('uses unified package name when source is unified', async () => {
      mockResolvePackage.mockResolvedValue({
        source: 'unified',
        packageName: 'radix-ui',
        primitive: 'dialog',
        version: '1.1.2',
        typesPath: 'dist/index.d.ts',
      });
      mockListPrimitives.mockResolvedValue([
        { name: 'dialog', package: '@radix-ui/react-dialog', description: '' },
      ]);

      const result = await handleListPrimitives({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.primitives[0].package).toBe('radix-ui');
    });

    it('uses custom provider: resolveVersion and listPrimitives shape output', async () => {
      const customProvider = {
        name: 'list-primitives-custom',
        displayName: 'Custom UI',
        listPrimitives: async () => ['button', 'input'],
        resolveVersion: async () => '1.0.0',
        fetchTypes: async () => '',
      };
      registerProvider(customProvider);

      const result = await handleListPrimitives({
        provider: 'list-primitives-custom',
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.version).toBe('1.0.0');
      expect(parsed.primitives).toEqual([
        { name: 'button', package: 'list-primitives-custom' },
        { name: 'input', package: 'list-primitives-custom' },
      ]);
    });

    it('propagates error when custom provider resolveVersion throws', async () => {
      const failingProvider = {
        name: 'list-primitives-failing',
        displayName: 'Failing UI',
        listPrimitives: async () => [],
        resolveVersion: async () => {
          throw new Error('Version resolution failed');
        },
        fetchTypes: async () => '',
      };
      registerProvider(failingProvider);

      await expect(handleListPrimitives({ provider: 'list-primitives-failing' })).rejects.toThrow(
        'Version resolution failed'
      );
    });

    it('propagates error when custom provider listPrimitives throws', async () => {
      const failingProvider = {
        name: 'list-primitives-failing-list',
        displayName: 'Failing UI',
        listPrimitives: async () => {
          throw new Error('List primitives failed');
        },
        resolveVersion: async () => '1.0.0',
        fetchTypes: async () => '',
      };
      registerProvider(failingProvider);

      await expect(
        handleListPrimitives({ provider: 'list-primitives-failing-list' })
      ).rejects.toThrow('List primitives failed');
    });
  });

  describe('extractPrimitiveTool', () => {
    it('has correct tool definition', () => {
      expect(extractPrimitiveTool.name).toBe('headless_extract_primitive');
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

      const rootProps = parsed.subComponents.find(
        (sc: { name: string }) => sc.name === 'Root'
      )?.props;
      expect(rootProps).toBeDefined();

      const openProp = rootProps.find((p: { name: string }) => p.name === 'open');
      expect(openProp?.category).toBe('state');

      const onChangeProp = rootProps.find((p: { name: string }) => p.name === 'onOpenChange');
      expect(onChangeProp?.category).toBe('event');
    });
  });
});
