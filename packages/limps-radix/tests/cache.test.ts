/**
 * Tests for the cache module.
 * TDD tests from agent 002 plan.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  readFromFile,
  writeToFile,
  deleteFile,
  deleteDir,
  getCacheDir,
  getCachePath,
  listCachedVersions,
  listCachedPrimitives,
} from '../src/cache/storage.js';
import {
  isExpired,
  isVersionDataExpired,
  isLatestResolutionExpired,
  TTL,
  formatRemainingTtl,
  getRemainingTtl,
} from '../src/cache/ttl.js';
import {
  getFromCache,
  saveToCache,
  getSignatureFromCache,
  saveSignatureToCache,
  getLatestResolution,
  saveLatestResolution,
  clearCache,
  getCacheStats,
} from '../src/cache/index.js';
import type { ExtractedPrimitive, BehaviorSignature } from '../src/types/index.js';

// Use a temporary directory for test isolation
let testDir: string;

beforeEach(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'limps-radix-cache-test-'));
});

afterEach(async () => {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe('cache/storage', () => {
  describe('readFromFile', () => {
    it('returns null for missing file', async () => {
      const result = await readFromFile(path.join(testDir, 'nonexistent.json'));
      expect(result).toBeNull();
    });

    it('returns data for existing file', async () => {
      const filePath = path.join(testDir, 'test.json');
      const data = { foo: 'bar', num: 42 };
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(data));

      const result = await readFromFile<typeof data>(filePath);
      expect(result).toEqual(data);
    });

    it('returns null for invalid JSON', async () => {
      const filePath = path.join(testDir, 'invalid.json');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, 'not valid json');

      const result = await readFromFile(filePath);
      expect(result).toBeNull();
    });
  });

  describe('writeToFile', () => {
    it('creates directories and writes JSON', async () => {
      const filePath = path.join(testDir, 'deep', 'nested', 'test.json');
      const data = { name: 'test', value: 123 };

      await writeToFile(filePath, data);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(content)).toEqual(data);
    });

    it('overwrites existing file', async () => {
      const filePath = path.join(testDir, 'overwrite.json');
      await writeToFile(filePath, { old: 'data' });
      await writeToFile(filePath, { new: 'data' });

      const result = await readFromFile<{ new: string }>(filePath);
      expect(result).toEqual({ new: 'data' });
    });
  });

  describe('deleteFile', () => {
    it('deletes existing file', async () => {
      const filePath = path.join(testDir, 'delete.json');
      await writeToFile(filePath, { data: 'test' });

      const result = await deleteFile(filePath);
      expect(result).toBe(true);

      const exists = await readFromFile(filePath);
      expect(exists).toBeNull();
    });

    it('returns false for non-existent file', async () => {
      const filePath = path.join(testDir, 'nonexistent.json');
      const result = await deleteFile(filePath);
      expect(result).toBe(false);
    });
  });

  describe('deleteDir', () => {
    it('deletes directory and contents', async () => {
      const dirPath = path.join(testDir, 'toDelete');
      await writeToFile(path.join(dirPath, 'file1.json'), { a: 1 });
      await writeToFile(path.join(dirPath, 'file2.json'), { b: 2 });

      const result = await deleteDir(dirPath);
      expect(result).toBe(true);

      try {
        await fs.access(dirPath);
        expect.fail('Directory should not exist');
      } catch {
        // Expected
      }
    });

    it('returns false for non-existent directory', async () => {
      const dirPath = path.join(testDir, 'nonexistent');
      const result = await deleteDir(dirPath);
      // fs.rm with force: true returns success even for non-existent
      expect(result).toBe(true);
    });
  });

  describe('getCacheDir', () => {
    it('returns path under home directory by default', () => {
      const cacheDir = getCacheDir();
      expect(cacheDir).toContain('.limps-radix');
      expect(cacheDir).toContain('cache');
    });

    it('uses custom base directory', () => {
      const cacheDir = getCacheDir('/custom/base');
      expect(cacheDir).toBe('/custom/base/.limps-radix/cache');
    });
  });

  describe('getCachePath', () => {
    it('returns correct path for data cache', () => {
      const cachePath = getCachePath('Dialog', '1.0.5', 'data', testDir);
      expect(cachePath).toContain('1.0.5');
      expect(cachePath).toContain('dialog.json');
      expect(cachePath).not.toContain('.sig.');
    });

    it('returns correct path for signature cache', () => {
      const cachePath = getCachePath('Dialog', '1.0.5', 'sig', testDir);
      expect(cachePath).toContain('1.0.5');
      expect(cachePath).toContain('dialog.sig.json');
    });
  });

  describe('listCachedVersions', () => {
    it('returns empty array for missing cache', async () => {
      const versions = await listCachedVersions(testDir);
      expect(versions).toEqual([]);
    });

    it('returns list of version directories', async () => {
      const cacheDir = getCacheDir(testDir);
      await writeToFile(path.join(cacheDir, '1.0.0', 'dialog.json'), {});
      await writeToFile(path.join(cacheDir, '1.0.5', 'dialog.json'), {});
      await writeToFile(path.join(cacheDir, '2.0.0', 'dialog.json'), {});

      const versions = await listCachedVersions(testDir);
      expect(versions).toHaveLength(3);
      expect(versions).toContain('1.0.0');
      expect(versions).toContain('1.0.5');
      expect(versions).toContain('2.0.0');
    });
  });

  describe('listCachedPrimitives', () => {
    it('returns empty array for missing version', async () => {
      const primitives = await listCachedPrimitives('1.0.0', testDir);
      expect(primitives).toEqual([]);
    });

    it('returns list of cached primitives', async () => {
      const cacheDir = getCacheDir(testDir);
      await writeToFile(path.join(cacheDir, '1.0.0', 'dialog.json'), {});
      await writeToFile(path.join(cacheDir, '1.0.0', 'tooltip.json'), {});
      await writeToFile(path.join(cacheDir, '1.0.0', 'dialog.sig.json'), {});

      const primitives = await listCachedPrimitives('1.0.0', testDir);
      expect(primitives).toHaveLength(2);
      expect(primitives).toContain('Dialog');
      expect(primitives).toContain('Tooltip');
    });
  });
});

describe('cache/ttl', () => {
  describe('isExpired', () => {
    it('returns false for fresh data', () => {
      const now = new Date().toISOString();
      expect(isExpired(now, TTL.VERSION_DATA)).toBe(false);
    });

    it('returns true for stale data', () => {
      const pastTime = new Date(Date.now() - TTL.VERSION_DATA - 1000).toISOString();
      expect(isExpired(pastTime, TTL.VERSION_DATA)).toBe(true);
    });

    it('returns true for exactly expired data', () => {
      const exactExpiry = new Date(Date.now() - TTL.VERSION_DATA).toISOString();
      expect(isExpired(exactExpiry, TTL.VERSION_DATA)).toBe(true);
    });
  });

  describe('isVersionDataExpired', () => {
    it('uses VERSION_DATA TTL (7 days)', () => {
      const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
      expect(isVersionDataExpired(sixDaysAgo)).toBe(false);

      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      expect(isVersionDataExpired(eightDaysAgo)).toBe(true);
    });
  });

  describe('isLatestResolutionExpired', () => {
    it('uses LATEST_RESOLUTION TTL (1 hour)', () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      expect(isLatestResolutionExpired(thirtyMinutesAgo)).toBe(false);

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      expect(isLatestResolutionExpired(twoHoursAgo)).toBe(true);
    });
  });

  describe('getRemainingTtl', () => {
    it('returns positive value for fresh data', () => {
      const now = new Date().toISOString();
      const remaining = getRemainingTtl(now, TTL.VERSION_DATA);
      expect(remaining).toBeGreaterThan(TTL.VERSION_DATA - 1000);
    });

    it('returns negative value for expired data', () => {
      const pastTime = new Date(Date.now() - TTL.VERSION_DATA - 1000).toISOString();
      const remaining = getRemainingTtl(pastTime, TTL.VERSION_DATA);
      expect(remaining).toBeLessThan(0);
    });
  });

  describe('formatRemainingTtl', () => {
    it('formats days correctly', () => {
      expect(formatRemainingTtl(2 * 24 * 60 * 60 * 1000)).toBe('2 days');
      expect(formatRemainingTtl(1 * 24 * 60 * 60 * 1000)).toBe('1 day');
    });

    it('formats hours correctly', () => {
      expect(formatRemainingTtl(3 * 60 * 60 * 1000)).toBe('3 hours');
      expect(formatRemainingTtl(1 * 60 * 60 * 1000)).toBe('1 hour');
    });

    it('formats minutes correctly', () => {
      expect(formatRemainingTtl(45 * 60 * 1000)).toBe('45 minutes');
      expect(formatRemainingTtl(1 * 60 * 1000)).toBe('1 minute');
    });

    it('formats seconds correctly', () => {
      expect(formatRemainingTtl(30 * 1000)).toBe('30 seconds');
      expect(formatRemainingTtl(1 * 1000)).toBe('1 second');
    });

    it('returns expired for negative values', () => {
      expect(formatRemainingTtl(-1000)).toBe('expired');
      expect(formatRemainingTtl(0)).toBe('expired');
    });
  });
});

describe('cache integration', () => {
  // Sample extracted primitive for testing
  const sampleExtracted: ExtractedPrimitive = {
    name: 'Dialog',
    package: '@radix-ui/react-dialog',
    version: '1.0.5',
    extractedAt: new Date().toISOString(),
    rootProps: [
      {
        name: 'open',
        type: 'boolean',
        required: false,
        isStateControl: true,
        isEventHandler: false,
        isConfiguration: false,
        isComposition: false,
      },
    ],
    subComponents: [],
    exports: ['Root', 'Trigger', 'Content'],
    usesContext: true,
  };

  // Sample signature for testing
  const sampleSignature: BehaviorSignature = {
    primitive: 'Dialog',
    package: '@radix-ui/react-dialog',
    version: '1.0.5',
    statePattern: 'binary',
    compositionPattern: 'compound',
    renderingPattern: 'portal-conditional',
    distinguishingProps: ['modal', 'Overlay'],
    antiPatternProps: ['Action', 'Cancel'],
    subComponents: [
      { name: 'Root', role: 'other', required: true },
      { name: 'Trigger', role: 'trigger', required: true },
      { name: 'Content', role: 'content', required: true },
    ],
    similarTo: ['AlertDialog'],
    disambiguationRule: 'Dialog has a modal prop',
  };

  describe('getFromCache', () => {
    it('returns null if not cached', async () => {
      const result = await getFromCache('Dialog', '1.0.5', { baseDir: testDir });
      expect(result).toBeNull();
    });

    it('returns null if expired', async () => {
      const expiredData = {
        ...sampleExtracted,
        extractedAt: new Date(Date.now() - TTL.VERSION_DATA - 1000).toISOString(),
      };
      await saveToCache('Dialog', '1.0.5', expiredData, { baseDir: testDir });

      const result = await getFromCache('Dialog', '1.0.5', { baseDir: testDir });
      expect(result).toBeNull();
    });

    it('returns data if ignoreExpired is true', async () => {
      const expiredData = {
        ...sampleExtracted,
        extractedAt: new Date(Date.now() - TTL.VERSION_DATA - 1000).toISOString(),
      };
      await saveToCache('Dialog', '1.0.5', expiredData, { baseDir: testDir });

      const result = await getFromCache('Dialog', '1.0.5', {
        baseDir: testDir,
        ignoreExpired: true,
      });
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Dialog');
    });
  });

  describe('saveToCache + getFromCache', () => {
    it('roundtrips correctly', async () => {
      await saveToCache('Dialog', '1.0.5', sampleExtracted, { baseDir: testDir });
      const result = await getFromCache('Dialog', '1.0.5', { baseDir: testDir });

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Dialog');
      expect(result?.package).toBe('@radix-ui/react-dialog');
      expect(result?.version).toBe('1.0.5');
    });
  });

  describe('getSignatureFromCache', () => {
    it('returns null if not cached', async () => {
      const result = await getSignatureFromCache('Dialog', '1.0.5', {
        baseDir: testDir,
      });
      expect(result).toBeNull();
    });

    it('returns null if extracted data is missing', async () => {
      // Save signature without extracted data
      const sigPath = getCachePath('Dialog', '1.0.5', 'sig', testDir);
      await writeToFile(sigPath, sampleSignature);

      const result = await getSignatureFromCache('Dialog', '1.0.5', {
        baseDir: testDir,
      });
      expect(result).toBeNull();
    });
  });

  describe('saveSignatureToCache + getSignatureFromCache', () => {
    it('roundtrips correctly with extracted data', async () => {
      // Need to save extracted data first
      await saveToCache('Dialog', '1.0.5', sampleExtracted, { baseDir: testDir });
      await saveSignatureToCache('Dialog', '1.0.5', sampleSignature, {
        baseDir: testDir,
      });

      const result = await getSignatureFromCache('Dialog', '1.0.5', {
        baseDir: testDir,
      });

      expect(result).not.toBeNull();
      expect(result?.primitive).toBe('Dialog');
      expect(result?.statePattern).toBe('binary');
    });
  });

  describe('getLatestResolution + saveLatestResolution', () => {
    it('returns null if not set', async () => {
      const result = await getLatestResolution('Dialog', { baseDir: testDir });
      expect(result).toBeNull();
    });

    it('roundtrips correctly', async () => {
      await saveLatestResolution('Dialog', '1.0.5', { baseDir: testDir });
      const result = await getLatestResolution('Dialog', { baseDir: testDir });

      expect(result).not.toBeNull();
      expect(result?.version).toBe('1.0.5');
    });

    it('returns null if expired', async () => {
      await saveLatestResolution('Dialog', '1.0.5', { baseDir: testDir });

      // Manually expire the entry
      const cacheDir = getCacheDir(testDir);
      const latestPath = path.join(cacheDir, 'latest-resolved.json');
      const cache = await readFromFile<Record<string, { version: string; resolvedAt: string }>>(
        latestPath
      );
      if (cache) {
        cache['Dialog'].resolvedAt = new Date(
          Date.now() - TTL.LATEST_RESOLUTION - 1000
        ).toISOString();
        await writeToFile(latestPath, cache);
      }

      const result = await getLatestResolution('Dialog', { baseDir: testDir });
      expect(result).toBeNull();
    });
  });

  describe('clearCache', () => {
    it('clears all cache when no args', async () => {
      await saveToCache('Dialog', '1.0.5', sampleExtracted, { baseDir: testDir });
      await saveToCache('Tooltip', '1.0.3', { ...sampleExtracted, name: 'Tooltip' }, {
        baseDir: testDir,
      });

      await clearCache(undefined, undefined, { baseDir: testDir });

      const result1 = await getFromCache('Dialog', '1.0.5', { baseDir: testDir });
      const result2 = await getFromCache('Tooltip', '1.0.3', { baseDir: testDir });
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('clears specific primitive and version', async () => {
      await saveToCache('Dialog', '1.0.5', sampleExtracted, { baseDir: testDir });
      await saveToCache('Dialog', '1.0.6', { ...sampleExtracted, version: '1.0.6' }, {
        baseDir: testDir,
      });

      await clearCache('Dialog', '1.0.5', { baseDir: testDir });

      const result1 = await getFromCache('Dialog', '1.0.5', { baseDir: testDir });
      const result2 = await getFromCache('Dialog', '1.0.6', { baseDir: testDir });
      expect(result1).toBeNull();
      expect(result2).not.toBeNull();
    });

    it('clears all versions of specific primitive', async () => {
      await saveToCache('Dialog', '1.0.5', sampleExtracted, { baseDir: testDir });
      await saveToCache('Dialog', '1.0.6', { ...sampleExtracted, version: '1.0.6' }, {
        baseDir: testDir,
      });
      await saveToCache('Tooltip', '1.0.3', { ...sampleExtracted, name: 'Tooltip' }, {
        baseDir: testDir,
      });

      await clearCache('Dialog', undefined, { baseDir: testDir });

      const result1 = await getFromCache('Dialog', '1.0.5', { baseDir: testDir });
      const result2 = await getFromCache('Dialog', '1.0.6', { baseDir: testDir });
      const result3 = await getFromCache('Tooltip', '1.0.3', { baseDir: testDir });
      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(result3).not.toBeNull();
    });
  });

  describe('getCacheStats', () => {
    it('returns empty stats for empty cache', async () => {
      const stats = await getCacheStats({ baseDir: testDir });
      expect(stats.versions).toEqual([]);
      expect(stats.primitiveCount).toBe(0);
      expect(stats.signatureCount).toBe(0);
    });

    it('returns correct stats', async () => {
      await saveToCache('Dialog', '1.0.5', sampleExtracted, { baseDir: testDir });
      await saveSignatureToCache('Dialog', '1.0.5', sampleSignature, {
        baseDir: testDir,
      });
      await saveToCache('Tooltip', '1.0.5', { ...sampleExtracted, name: 'Tooltip' }, {
        baseDir: testDir,
      });

      const stats = await getCacheStats({ baseDir: testDir });
      expect(stats.versions).toContain('1.0.5');
      expect(stats.primitiveCount).toBe(2);
      expect(stats.signatureCount).toBe(1);
    });
  });
});
