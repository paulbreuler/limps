import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, rmdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getVersionState,
  updateLastSeenVersion,
  shouldShowWhatsNew,
} from '../../src/utils/version-state.js';

// Mock the os-paths module to use a temporary directory
const testBasePath = join(tmpdir(), 'limps-test-version-state');
const testVersionStatePath = join(testBasePath, 'version-state.json');

// Mock getOSBasePath to return our test directory
vi.mock('../../src/utils/os-paths.js', async () => {
  const actual = await vi.importActual('../../src/utils/os-paths.js');
  return {
    ...actual,
    getOSBasePath: (): string => testBasePath,
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
    if (existsSync(testBasePath)) {
      try {
        rmdirSync(testBasePath);
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
    if (existsSync(testBasePath)) {
      try {
        rmdirSync(testBasePath);
      } catch {
        // Ignore errors if directory not empty
      }
    }
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
      mkdirSync(testBasePath, { recursive: true });
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
      mkdirSync(testBasePath, { recursive: true });
      writeFileSync(testVersionStatePath, 'invalid json', 'utf-8');

      const state = getVersionState();
      expect(state.lastSeenVersion).toBe('1.2.0');
    });

    it('resets to current version if state structure is invalid', () => {
      // Create a state file with invalid structure
      mkdirSync(testBasePath, { recursive: true });
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
      mkdirSync(testBasePath, { recursive: true });
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
      mkdirSync(testBasePath, { recursive: true });
      writeFileSync(
        testVersionStatePath,
        JSON.stringify({ lastSeenVersion: '1.1.0' }, null, 2),
        'utf-8'
      );

      expect(shouldShowWhatsNew('1.2.0')).toBe(true);
    });

    it('returns false if current version equals last seen', () => {
      // Set last seen to current version
      mkdirSync(testBasePath, { recursive: true });
      writeFileSync(
        testVersionStatePath,
        JSON.stringify({ lastSeenVersion: '1.2.0' }, null, 2),
        'utf-8'
      );

      expect(shouldShowWhatsNew('1.2.0')).toBe(false);
    });

    it('returns false if current version is less than last seen', () => {
      // Set last seen to a newer version
      mkdirSync(testBasePath, { recursive: true });
      writeFileSync(
        testVersionStatePath,
        JSON.stringify({ lastSeenVersion: '1.3.0' }, null, 2),
        'utf-8'
      );

      expect(shouldShowWhatsNew('1.2.0')).toBe(false);
    });

    it('uses package version if no version provided', () => {
      // Set last seen to an older version
      mkdirSync(testBasePath, { recursive: true });
      writeFileSync(
        testVersionStatePath,
        JSON.stringify({ lastSeenVersion: '1.1.0' }, null, 2),
        'utf-8'
      );

      // Should use mocked getPackageVersion which returns '1.2.0'
      expect(shouldShowWhatsNew()).toBe(true);
    });

    it('handles patch version increments', () => {
      mkdirSync(testBasePath, { recursive: true });
      writeFileSync(
        testVersionStatePath,
        JSON.stringify({ lastSeenVersion: '1.2.0' }, null, 2),
        'utf-8'
      );

      expect(shouldShowWhatsNew('1.2.1')).toBe(true);
    });

    it('handles minor version increments', () => {
      mkdirSync(testBasePath, { recursive: true });
      writeFileSync(
        testVersionStatePath,
        JSON.stringify({ lastSeenVersion: '1.2.0' }, null, 2),
        'utf-8'
      );

      expect(shouldShowWhatsNew('1.3.0')).toBe(true);
    });

    it('handles major version increments', () => {
      mkdirSync(testBasePath, { recursive: true });
      writeFileSync(
        testVersionStatePath,
        JSON.stringify({ lastSeenVersion: '1.2.0' }, null, 2),
        'utf-8'
      );

      expect(shouldShowWhatsNew('2.0.0')).toBe(true);
    });
  });
});
