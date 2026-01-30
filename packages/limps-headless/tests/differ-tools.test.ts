/**
 * Tests for radix_diff_versions and radix_check_updates.
 *
 * We test:
 * - Input contract: schema validation, defaults, optional params.
 * - Expected behavior: diff result shape, breakingOnly filter, update detection, first-run vs cached.
 * - Failure modes: invalid input throws, unsupported provider throws, dependency errors propagate.
 * - Edge cases: no cached version (first run), cached equals latest (no update).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  diffVersionsInputSchema,
  checkUpdatesInputSchema,
  handleDiffVersions,
  handleCheckUpdates,
} from '../src/tools/index.js';

const mockDiffVersions = vi.fn();
const mockGetProvider = vi.fn();
const mockGetLatestResolution = vi.fn();
const mockSaveLatestResolution = vi.fn();
const mockClearCache = vi.fn();
const mockResolvePackageVersion = vi.fn();

vi.mock('../src/providers/registry.js', () => ({
  getProvider: (name: string) => mockGetProvider(name),
}));

vi.mock('../src/differ/index.js', () => ({
  diffVersions: (...args: unknown[]) => mockDiffVersions(...args),
}));

vi.mock('../src/cache/index.js', () => ({
  getLatestResolution: (primitive: string) =>
    mockGetLatestResolution(primitive),
  saveLatestResolution: (primitive: string, version: string) =>
    mockSaveLatestResolution(primitive, version),
  clearCache: () => mockClearCache(),
  getFromCache: vi.fn().mockResolvedValue(null),
  saveToCache: vi.fn().mockResolvedValue(undefined),
  getSignatureFromCache: vi.fn().mockResolvedValue(null),
  saveSignatureToCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/fetcher/npm-registry.js', () => ({
  resolvePackageVersion: (pkg: string, tag: string) =>
    mockResolvePackageVersion(pkg, tag),
}));

describe('diffVersionsInputSchema', () => {
  it('requires fromVersion', () => {
    const result = diffVersionsInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts valid input', () => {
    const result = diffVersionsInputSchema.safeParse({
      fromVersion: '1.0.0',
    });
    expect(result.success).toBe(true);
    expect(result.data?.fromVersion).toBe('1.0.0');
    expect(result.data?.toVersion).toBe('latest');
    expect(result.data?.breakingOnly).toBe(false);
  });

  it('accepts all options', () => {
    const result = diffVersionsInputSchema.safeParse({
      fromVersion: '1.0.0',
      toVersion: '2.0.0',
      primitives: ['dialog', 'popover'],
      breakingOnly: true,
    });
    expect(result.success).toBe(true);
    expect(result.data?.toVersion).toBe('2.0.0');
    expect(result.data?.primitives).toEqual(['dialog', 'popover']);
    expect(result.data?.breakingOnly).toBe(true);
  });
});

describe('checkUpdatesInputSchema', () => {
  it('accepts empty input', () => {
    const result = checkUpdatesInputSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data?.refreshCache).toBe(false);
  });

  it('accepts refreshCache option', () => {
    const result = checkUpdatesInputSchema.safeParse({
      refreshCache: true,
    });
    expect(result.success).toBe(true);
    expect(result.data?.refreshCache).toBe(true);
  });

  it('accepts primitives option', () => {
    const result = checkUpdatesInputSchema.safeParse({
      primitives: ['dialog', 'tooltip'],
    });
    expect(result.success).toBe(true);
    expect(result.data?.primitives).toEqual(['dialog', 'tooltip']);
  });
});

describe('handleDiffVersions', () => {
  beforeEach(() => {
    mockGetProvider.mockReturnValue({ name: 'radix' });
    mockDiffVersions.mockResolvedValue({
      fromVersion: '1.0.0',
      toVersion: '2.0.0',
      changes: [],
      summary: { totalChanges: 0, breaking: 0, warnings: 0, info: 0 },
    });
  });

  it('returns MCP text content with diff result (fromVersion, toVersion, changes, summary)', async () => {
    const result = await handleDiffVersions({
      fromVersion: '1.0.0',
      toVersion: '2.0.0',
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toMatchObject({
      fromVersion: '1.0.0',
      toVersion: '2.0.0',
      changes: [],
      summary: expect.objectContaining({ totalChanges: 0 }),
    });
  });

  it('passes primitives filter to diff when provided', async () => {
    await handleDiffVersions({
      fromVersion: '1.0.0',
      toVersion: '2.0.0',
      primitives: ['dialog', 'tooltip'],
    });

    expect(mockDiffVersions).toHaveBeenCalledWith(
      '1.0.0',
      '2.0.0',
      ['dialog', 'tooltip']
    );
  });

  it('filters output to breaking changes only when breakingOnly is true', async () => {
    mockDiffVersions.mockResolvedValue({
      fromVersion: '1.0.0',
      toVersion: '2.0.0',
      changes: [
        { severity: 'breaking', primitive: 'dialog', message: 'Removed prop' },
        { severity: 'info', primitive: 'dialog', message: 'New prop' },
      ],
      summary: { totalChanges: 2, breaking: 1, warnings: 0, info: 1 },
    });

    const result = await handleDiffVersions({
      fromVersion: '1.0.0',
      toVersion: '2.0.0',
      breakingOnly: true,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.changes).toHaveLength(1);
    expect(parsed.changes[0].severity).toBe('breaking');
    expect(parsed.summary.totalChanges).toBe(1);
    expect(parsed.summary.breaking).toBe(1);
    expect(parsed.summary.breaking).toBe(parsed.summary.totalChanges);
  });

  it('throws for unsupported provider with clear message', async () => {
    mockGetProvider.mockReturnValue({ name: 'other' });

    await expect(
      handleDiffVersions({ fromVersion: '1.0.0', provider: 'other' })
    ).rejects.toThrow(/not supported for diffing/);
  });

  it('rejects invalid input (missing fromVersion)', async () => {
    await expect(handleDiffVersions({})).rejects.toThrow();
  });

  it('propagates error when diffVersions fails', async () => {
    mockDiffVersions.mockRejectedValue(new Error('Fetch failed'));

    await expect(
      handleDiffVersions({ fromVersion: '1.0.0', toVersion: '2.0.0' })
    ).rejects.toThrow('Fetch failed');
  });
});

describe('handleCheckUpdates', () => {
  beforeEach(() => {
    mockGetProvider.mockReturnValue({ name: 'radix' });
    mockGetLatestResolution.mockResolvedValue({
      version: '1.0.0',
      resolvedAt: new Date().toISOString(),
    });
    mockResolvePackageVersion.mockResolvedValue('2.0.0');
    mockSaveLatestResolution.mockResolvedValue(undefined);
    mockDiffVersions.mockResolvedValue({
      fromVersion: '1.0.0',
      toVersion: '2.0.0',
      changes: [],
      summary: { totalChanges: 0, breaking: 0, warnings: 0, info: 0 },
    });
  });

  it('reports update and includes diff when cached version is older than latest', async () => {
    const result = await handleCheckUpdates({});

    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.currentVersion).toBe('1.0.0');
    expect(parsed.latestVersion).toBe('2.0.0');
    expect(parsed.hasUpdate).toBe(true);
    expect(parsed.diff).toBeDefined();
    expect(parsed.diff).toMatchObject({
      fromVersion: '1.0.0',
      toVersion: '2.0.0',
      changes: [],
      summary: expect.any(Object),
    });
  });

  it('reports no update when cached version equals latest', async () => {
    mockResolvePackageVersion.mockResolvedValue('1.0.0');

    const result = await handleCheckUpdates({});

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hasUpdate).toBe(false);
    expect(parsed.diff).toBeUndefined();
  });

  it('first run: no cached version yields hasUpdate false and no diff', async () => {
    mockGetLatestResolution.mockResolvedValue(undefined);
    mockResolvePackageVersion.mockResolvedValue('2.0.0');

    const result = await handleCheckUpdates({});

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.currentVersion).toBe('2.0.0');
    expect(parsed.latestVersion).toBe('2.0.0');
    expect(parsed.hasUpdate).toBe(false);
    expect(parsed.diff).toBeUndefined();
  });

  it('when refreshCache is true, clears cache before checking so result reflects latest', async () => {
    mockClearCache.mockResolvedValue(undefined);

    await handleCheckUpdates({ refreshCache: true });

    expect(mockClearCache).toHaveBeenCalled();
  });

  it('passes primitives to diff when generating update diff', async () => {
    await handleCheckUpdates({ primitives: ['dialog', 'tooltip'] });

    expect(mockDiffVersions).toHaveBeenCalledWith(
      '1.0.0',
      '2.0.0',
      ['dialog', 'tooltip']
    );
  });

  it('throws for unsupported provider with clear message', async () => {
    mockGetProvider.mockReturnValue({ name: 'other' });

    await expect(
      handleCheckUpdates({ provider: 'other' })
    ).rejects.toThrow(/not supported for update checks/);
  });

  it('propagates error when npm resolution fails', async () => {
    mockResolvePackageVersion.mockRejectedValue(new Error('Network error'));

    await expect(handleCheckUpdates({})).rejects.toThrow('Network error');
  });

  it('rejects invalid input (wrong type for refreshCache)', async () => {
    await expect(
      handleCheckUpdates({ refreshCache: 'yes' as unknown as boolean })
    ).rejects.toThrow();
  });
});
