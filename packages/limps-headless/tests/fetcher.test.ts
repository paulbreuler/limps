/**
 * Tests for the fetcher module.
 * TDD tests from agent 001 plan.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveVersion,
  listPrimitives,
  primitiveToPackage,
  packageToPrimitive,
  KNOWN_PRIMITIVES,
} from '../src/fetcher/npm-registry.js';
import { fetchTypes, buildTypesUrl } from '../src/fetcher/unpkg.js';

describe('fetcher/npm-registry', () => {
  describe('primitiveToPackage', () => {
    it('converts primitive name to package name', () => {
      expect(primitiveToPackage('dialog')).toBe('@radix-ui/react-dialog');
      expect(primitiveToPackage('alert-dialog')).toBe('@radix-ui/react-alert-dialog');
      expect(primitiveToPackage('Dialog')).toBe('@radix-ui/react-dialog');
    });
  });

  describe('packageToPrimitive', () => {
    it('extracts primitive name from package name', () => {
      expect(packageToPrimitive('@radix-ui/react-dialog')).toBe('dialog');
      expect(packageToPrimitive('@radix-ui/react-alert-dialog')).toBe('alert-dialog');
    });

    it('throws for invalid package name', () => {
      expect(() => packageToPrimitive('invalid-package')).toThrow();
    });
  });

  describe('KNOWN_PRIMITIVES', () => {
    it('includes common primitives', () => {
      expect(KNOWN_PRIMITIVES).toContain('dialog');
      expect(KNOWN_PRIMITIVES).toContain('popover');
      expect(KNOWN_PRIMITIVES).toContain('tooltip');
      expect(KNOWN_PRIMITIVES).toContain('select');
    });
  });

  describe('listPrimitives', () => {
    it('returns array of primitive info', async () => {
      const primitives = await listPrimitives();

      expect(Array.isArray(primitives)).toBe(true);
      expect(primitives.length).toBeGreaterThan(0);

      const dialog = primitives.find((p) => p.name === 'dialog');
      expect(dialog).toBeDefined();
      expect(dialog?.package).toBe('@radix-ui/react-dialog');
    });
  });

  describe('resolveVersion', () => {
    beforeEach(() => {
      // Mock fetch for tests
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              name: '@radix-ui/react-dialog',
              'dist-tags': { latest: '1.0.5', next: '2.0.0-beta.1' },
            }),
        })
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('resolves "latest" to actual version', async () => {
      const version = await resolveVersion('dialog', 'latest');
      expect(version).toBe('1.0.5');
    });

    it('resolves dist-tag like "next"', async () => {
      const version = await resolveVersion('dialog', 'next');
      expect(version).toBe('2.0.0-beta.1');
    });
  });
});

describe('fetcher/unpkg', () => {
  describe('buildTypesUrl', () => {
    it('builds correct unpkg URL', () => {
      const url = buildTypesUrl('@radix-ui/react-dialog', '1.0.5');
      expect(url).toBe('https://unpkg.com/@radix-ui/react-dialog@1.0.5/dist/index.d.ts');
    });
  });

  describe('fetchTypes', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: () => Promise.resolve('export interface DialogProps { open?: boolean; }'),
        })
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('fetches .d.ts content', async () => {
      const content = await fetchTypes('dialog', '1.0.5');
      expect(content).toContain('DialogProps');
    });
  });

  describe('fetchTypes error handling', () => {
    it('throws on 404', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
        })
      );

      await expect(fetchTypes('nonexistent', '1.0.0')).rejects.toThrow('not found');

      vi.unstubAllGlobals();
    });
  });
});
