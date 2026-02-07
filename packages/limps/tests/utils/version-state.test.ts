import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, rmdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getVersionState,
  updateLastSeenVersion,
  shouldShowWhatsNew,
} from '../../src/utils/version-state.js';

// Mock homedir to use a temporary directory so getCachePath resolves inside it.
// Clear XDG_CACHE_HOME/LOCALAPPDATA so getCachePath falls back to homedir-based paths.
const savedXdg = process.env.XDG_CACHE_HOME;
const savedLocalAppData = process.env.LOCALAPPDATA;
delete process.env.XDG_CACHE_HOME;
delete process.env.LOCALAPPDATA;

const testHome = join(tmpdir(), 'limps-test-version-state-home');
// getCachePath uses platform-specific paths; mirror the same logic here
const testCachePath =
  process.platform === 'darwin'
    ? join(testHome, 'Library', 'Caches', 'limps')
    : process.platform === 'win32'
      ? join(testHome, 'AppData', 'Local', 'limps')
      : join(testHome, '.cache', 'limps');
const testVersionStatePath = join(testCachePath, 'version-state.json');

vi.mock('os', async () => {
  const actual = await vi.importActual('os');
  return {
    ...actual,
    homedir: (): string => testHome,
  };
});

// Mock getPackageVersion to return a test version
vi.mock('../../src/utils/version.js', async () => {
  const actual = await vi.importActual('../../src/utils/version.js');
  return {
    ...actual,
    getPackageVersion: (): string => '1.2.0',
  };
});

describe('version-state.ts', () => {
  beforeEach(() => {
    // Clean up test directory
    if (existsSync(testVersionStatePath)) {
      unlinkSync(testVersionStatePath);
    }
    if (existsSync(testCachePath)) {
      try {
        rmdirSync(testCachePath);
      } catch {
        // Ignore errors if directory not empty
      }
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testVersionStatePath)) {
      unlinkSync(testVersionStatePath);
    }
    if (existsSync(testCachePath)) {
      try {
        rmdirSync(testCachePath);
      } catch {
        // Ignore errors if directory not empty
      }
    }
  });

  afterAll(() => {
    // Restore env vars cleared at module level
    if (savedXdg !== undefined) process.env.XDG_CACHE_HOME = savedXdg;
    if (savedLocalAppData !== undefined) process.env.LOCALAPPDATA = savedLocalAppData;
  });

  describe('getVersionState', () => {
    it('creates default state file if it does not exist', () => {
      const state = getVersionState();
      expect(state).toBeDefined();
      expect(state.lastSeenVersion).toBe('1.2.0');
      expect(existsSync(testVersionStatePath)).toBe(true);
    });

    it('reads existing state file', () => {
      // Create a test state file
      mkdirSync(testCachePath, { recursive: true });
      writeFileSync(
        testVersionStatePath,
        JSON.stringify({ lastSeenVersion: '1.1.0' }, null, 2),
        'utf-8'
      );

      const state = getVersionState();
      expect(state.lastSeenVersion).toBe('1.1.0');
    });

    it('resets to current version if state file is invalid', () => {
      // Create an invalid state file
      mkdirSync(testCachePath, { recursive: true });
      writeFileSync(testVersionStatePath, 'invalid json', 'utf-8');

      const state = getVersionState();
      expect(state.lastSeenVersion).toBe('1.2.0');
    });

    it('resets to current version if state structure is invalid', () => {
      // Create a state file with invalid structure
      mkdirSync(testCachePath, { recursive: true });
      writeFileSync(testVersionStatePath, JSON.stringify({}), 'utf-8');

      const state = getVersionState();
      expect(state.lastSeenVersion).toBe('1.2.0');
    });
  });

  describe('updateLastSeenVersion', () => {
    it('creates state file with specified version', () => {
      updateLastSeenVersion('1.3.0');
      expect(existsSync(testVersionStatePath)).toBe(true);

      const content = readFileSync(testVersionStatePath, 'utf-8');
      const state = JSON.parse(content);
      expect(state.lastSeenVersion).toBe('1.3.0');
    });

    it('updates existing state file', () => {
      // Create initial state
      mkdirSync(testCachePath, { recursive: true });
      writeFileSync(
        testVersionStatePath,
        JSON.stringify({ lastSeenVersion: '1.1.0' }, null, 2),
        'utf-8'
      );

      updateLastSeenVersion('1.3.0');

      const content = readFileSync(testVersionStatePath, 'utf-8');
      const state = JSON.parse(content);
      expect(state.lastSeenVersion).toBe('1.3.0');
    });
  });

  describe('shouldShowWhatsNew', () => {
    it('returns true if current version is greater than last seen', () => {
      // Set last seen to an older version
      mkdirSync(testCachePath, { recursive: true });
      writeFileSync(
        testVersionStatePath,
        JSON.stringify({ lastSeenVersion: '1.1.0' }, null, 2),
        'utf-8'
      );

      expect(shouldShowWhatsNew('1.2.0')).toBe(true);
    });

    it('returns false if current version equals last seen', () => {
      // Set last seen to current version
      mkdirSync(testCachePath, { recursive: true });
      writeFileSync(
        testVersionStatePath,
        JSON.stringify({ lastSeenVersion: '1.2.0' }, null, 2),
        'utf-8'
      );

      expect(shouldShowWhatsNew('1.2.0')).toBe(false);
    });

    it('returns false if current version is less than last seen', () => {
      // Set last seen to a newer version
      mkdirSync(testCachePath, { recursive: true });
      writeFileSync(
        testVersionStatePath,
        JSON.stringify({ lastSeenVersion: '1.3.0' }, null, 2),
        'utf-8'
      );

      expect(shouldShowWhatsNew('1.2.0')).toBe(false);
    });

    it('uses package version if no version provided', () => {
      // Set last seen to an older version
      mkdirSync(testCachePath, { recursive: true });
      writeFileSync(
        testVersionStatePath,
        JSON.stringify({ lastSeenVersion: '1.1.0' }, null, 2),
        'utf-8'
      );

      // Should use mocked getPackageVersion which returns '1.2.0'
      expect(shouldShowWhatsNew()).toBe(true);
    });

    it('handles patch version increments', () => {
      mkdirSync(testCachePath, { recursive: true });
      writeFileSync(
        testVersionStatePath,
        JSON.stringify({ lastSeenVersion: '1.2.0' }, null, 2),
        'utf-8'
      );

      expect(shouldShowWhatsNew('1.2.1')).toBe(true);
    });

    it('handles minor version increments', () => {
      mkdirSync(testCachePath, { recursive: true });
      writeFileSync(
        testVersionStatePath,
        JSON.stringify({ lastSeenVersion: '1.2.0' }, null, 2),
        'utf-8'
      );

      expect(shouldShowWhatsNew('1.3.0')).toBe(true);
    });

    it('handles major version increments', () => {
      mkdirSync(testCachePath, { recursive: true });
      writeFileSync(
        testVersionStatePath,
        JSON.stringify({ lastSeenVersion: '1.2.0' }, null, 2),
        'utf-8'
      );

      expect(shouldShowWhatsNew('2.0.0')).toBe(true);
    });
  });
});
