import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';
import { getAppDataPath, getCachePath } from '../../src/utils/app-paths.js';

describe('app-paths', () => {
  let originalPlatform: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalPlatform = process.platform;
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
    process.env = originalEnv;
  });

  describe('getAppDataPath', () => {
    it('returns correct path on macOS', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });

      const expected = join(homedir(), 'Library', 'Application Support', 'limps');
      expect(getAppDataPath()).toBe(expected);
    });

    it('returns correct path on Windows with APPDATA env var', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });
      process.env.APPDATA = 'C:\\Users\\Test\\AppData\\Roaming';

      const expected = join('C:\\Users\\Test\\AppData\\Roaming', 'limps');
      expect(getAppDataPath()).toBe(expected);
    });

    it('falls back correctly on Windows without APPDATA', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });
      delete process.env.APPDATA;

      const expected = join(homedir(), 'AppData', 'Roaming', 'limps');
      expect(getAppDataPath()).toBe(expected);
    });

    it('returns correct path on Linux with XDG_DATA_HOME', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });
      process.env.XDG_DATA_HOME = '/home/test/.local/share';

      const expected = join('/home/test/.local/share', 'limps');
      expect(getAppDataPath()).toBe(expected);
    });

    it('falls back to .local/share on Linux without XDG_DATA_HOME', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });
      delete process.env.XDG_DATA_HOME;

      const expected = join(homedir(), '.local', 'share', 'limps');
      expect(getAppDataPath()).toBe(expected);
    });
  });

  describe('getCachePath', () => {
    it('returns correct path on macOS', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });

      const expected = join(homedir(), 'Library', 'Caches', 'limps');
      expect(getCachePath()).toBe(expected);
    });

    it('returns correct path on Windows with LOCALAPPDATA', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });
      process.env.LOCALAPPDATA = 'C:\\Users\\Test\\AppData\\Local';

      const expected = join('C:\\Users\\Test\\AppData\\Local', 'limps');
      expect(getCachePath()).toBe(expected);
    });

    it('falls back correctly on Windows without LOCALAPPDATA', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });
      delete process.env.LOCALAPPDATA;

      const expected = join(homedir(), 'AppData', 'Local', 'limps');
      expect(getCachePath()).toBe(expected);
    });

    it('returns correct path on Linux with XDG_CACHE_HOME', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });
      process.env.XDG_CACHE_HOME = '/home/test/.cache';

      const expected = join('/home/test/.cache', 'limps');
      expect(getCachePath()).toBe(expected);
    });

    it('falls back to .cache on Linux without XDG_CACHE_HOME', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });
      delete process.env.XDG_CACHE_HOME;

      const expected = join(homedir(), '.cache', 'limps');
      expect(getCachePath()).toBe(expected);
    });
  });
});
