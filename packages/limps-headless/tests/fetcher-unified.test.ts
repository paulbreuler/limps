/**
 * Tests for unified package support in the fetcher.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

const registryResponse = (name: string, latest: string) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: () =>
    Promise.resolve({
      name,
      'dist-tags': { latest },
      versions: {},
    }),
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('fetcher/unified-package', () => {
  it('detectPackageSource returns "unified" when radix-ui >= 1.4.3', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(registryResponse('radix-ui', '1.4.3')));

    const { detectPackageSource } = await import(
      '../src/fetcher/unified-package.js'
    );

    const source = await detectPackageSource('dialog');
    expect(source).toBe('unified');
  });

  it('detectPackageSource returns "individual" when radix-ui is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })
    );

    const { detectPackageSource } = await import(
      '../src/fetcher/unified-package.js'
    );

    const source = await detectPackageSource('dialog');
    expect(source).toBe('individual');
  });

  it('resolvePackage maps primitives to unified package paths', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(registryResponse('radix-ui', '1.4.3'))
        .mockResolvedValueOnce(registryResponse('radix-ui', '1.4.3'))
    );

    const { resolvePackage } = await import('../src/fetcher/unified-package.js');

    const resolved = await resolvePackage('dialog', 'latest');
    expect(resolved).toEqual({
      source: 'unified',
      packageName: 'radix-ui',
      primitive: 'dialog',
      version: '1.4.3',
      typesPath: 'dist/dialog.d.ts',
    });
  });

  it('fetchTypesWithFallback falls back to individual packages on unified failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.startsWith('https://registry.npmjs.org/radix-ui')) {
          return Promise.resolve(registryResponse('radix-ui', '1.4.3'));
        }
        if (url.includes('%40radix-ui%2Freact-dialog')) {
          return Promise.resolve(
            registryResponse('@radix-ui/react-dialog', '1.0.5')
          );
        }
        if (
          url.startsWith(
            'https://unpkg.com/radix-ui@1.4.3/dist/dialog.d.ts'
          )
        ) {
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: 'Not Found',
          });
        }
        if (
          url.startsWith(
            'https://unpkg.com/radix-ui@1.4.3/dist/dialog.d.mts'
          )
        ) {
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: 'Not Found',
          });
        }
        if (
          url.startsWith(
            'https://unpkg.com/@radix-ui/react-dialog@1.0.5/dist/index.d.ts'
          )
        ) {
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            text: () => Promise.resolve('export interface DialogProps {}'),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Unexpected URL',
        });
      })
    );

    const { fetchTypesWithFallback } = await import(
      '../src/fetcher/unified-package.js'
    );

    const result = await fetchTypesWithFallback('dialog', 'latest');
    expect(result.resolved.source).toBe('individual');
    expect(result.resolved.packageName).toBe('@radix-ui/react-dialog');
    expect(result.content).toContain('DialogProps');
  });
});
