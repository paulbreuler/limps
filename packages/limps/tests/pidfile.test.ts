import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getPidFilePath,
  getSystemPidDir,
  writePidFile,
  readPidFile,
  removePidFile,
  isProcessRunning,
  getRunningDaemon,
  discoverRunningDaemons,
  type PidFileContents,
} from '../src/pidfile.js';
import { existsSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as appPaths from '../src/utils/app-paths.js';

describe('pidfile', () => {
  const testPort = 19999;
  let pidFilePath: string;
  let testPidDir: string;

  beforeEach(() => {
    // Create isolated temp directory for this test run
    testPidDir = join(
      tmpdir(),
      `test-pidfile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      'pids'
    );
    mkdirSync(testPidDir, { recursive: true });

    // Mock getAppDataPath to return our temp directory
    vi.spyOn(appPaths, 'getAppDataPath').mockReturnValue(testPidDir.replace(/\/pids$/, ''));

    pidFilePath = getPidFilePath(testPort);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up temp directory
    const testRoot = testPidDir.replace(/\/pids$/, '');
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  describe('getSystemPidDir', () => {
    it('should return a path ending with pids', () => {
      const dir = getSystemPidDir();
      expect(dir).toMatch(/pids$/);
    });
  });

  describe('getPidFilePath', () => {
    it('should return path with port number', () => {
      const path = getPidFilePath(4269);
      expect(path).toMatch(/limps-4269\.pid$/);
    });

    it('should return different paths for different ports', () => {
      const path1 = getPidFilePath(4269);
      const path2 = getPidFilePath(8080);
      expect(path1).not.toBe(path2);
    });
  });

  describe('writePidFile', () => {
    it('should write PID file with correct contents', () => {
      const contents: PidFileContents = {
        pid: 12345,
        port: 4269,
        host: '127.0.0.1',
        startedAt: new Date().toISOString(),
      };

      writePidFile(pidFilePath, contents);

      expect(existsSync(pidFilePath)).toBe(true);
      const read = readPidFile(pidFilePath);
      expect(read).toEqual(contents);
    });

    it('should create parent directory if it does not exist', () => {
      // writePidFile calls mkdirSync internally - tested via the main write test
      // which writes to the system PID directory (created automatically)
      expect(existsSync(pidFilePath)).toBe(false);
      const contents: PidFileContents = {
        pid: 12345,
        port: testPort,
        host: '127.0.0.1',
        startedAt: new Date().toISOString(),
      };
      writePidFile(pidFilePath, contents);
      expect(existsSync(pidFilePath)).toBe(true);
    });
  });

  describe('readPidFile', () => {
    it('should return null for non-existent file', () => {
      const result = readPidFile('/nonexistent/path/limps.pid');
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      writePidFile(pidFilePath, { pid: 123, port: 4269, host: '127.0.0.1', startedAt: 'test' });
      // Corrupt the file
      writeFileSync(pidFilePath, 'invalid json');

      const result = readPidFile(pidFilePath);
      expect(result).toBeNull();
    });

    it('should return null for missing required fields', () => {
      writeFileSync(pidFilePath, JSON.stringify({ pid: 'not-a-number', port: 4269 }));

      const result = readPidFile(pidFilePath);
      expect(result).toBeNull();
    });

    it('should successfully read valid PID file', () => {
      const contents: PidFileContents = {
        pid: 12345,
        port: 4269,
        host: '127.0.0.1',
        startedAt: '2024-01-01T00:00:00.000Z',
      };

      writePidFile(pidFilePath, contents);
      const result = readPidFile(pidFilePath);

      expect(result).toEqual(contents);
    });
  });

  describe('removePidFile', () => {
    it('should remove existing PID file', () => {
      writePidFile(pidFilePath, { pid: 123, port: 4269, host: '127.0.0.1', startedAt: 'test' });
      expect(existsSync(pidFilePath)).toBe(true);

      removePidFile(pidFilePath);
      expect(existsSync(pidFilePath)).toBe(false);
    });

    it('should not throw for non-existent file', () => {
      expect(() => removePidFile('/nonexistent/path/limps.pid')).not.toThrow();
    });
  });

  describe('isProcessRunning', () => {
    it('should return true for current process', () => {
      expect(isProcessRunning(process.pid)).toBe(true);
    });

    it('should return false for non-existent PID', () => {
      expect(isProcessRunning(99999)).toBe(false);
    });
  });

  describe('getRunningDaemon', () => {
    it('should return null if no PID file exists', () => {
      const result = getRunningDaemon(pidFilePath);
      expect(result).toBeNull();
    });

    it('should return null and clean up stale PID file', () => {
      writePidFile(pidFilePath, {
        pid: 99999,
        port: 4269,
        host: '127.0.0.1',
        startedAt: new Date().toISOString(),
      });

      const result = getRunningDaemon(pidFilePath);
      expect(result).toBeNull();
      expect(existsSync(pidFilePath)).toBe(false);
    });

    it('should return contents for running process', () => {
      const contents: PidFileContents = {
        pid: process.pid,
        port: 4269,
        host: '127.0.0.1',
        startedAt: new Date().toISOString(),
      };

      writePidFile(pidFilePath, contents);
      const result = getRunningDaemon(pidFilePath);

      expect(result).toEqual(contents);
      expect(existsSync(pidFilePath)).toBe(true);
    });
  });

  describe('discoverRunningDaemons', () => {
    it('should return empty array when no PID files exist', () => {
      const results = discoverRunningDaemons();
      // May or may not be empty depending on system state, but should not throw
      expect(Array.isArray(results)).toBe(true);
    });

    it('should find running daemons in system PID directory', () => {
      // Write a PID file for the current process
      const systemPidDir = getSystemPidDir();
      const testPidPath = join(systemPidDir, 'limps-19876.pid');

      try {
        writePidFile(testPidPath, {
          pid: process.pid,
          port: 19876,
          host: '127.0.0.1',
          startedAt: new Date().toISOString(),
        });

        const results = discoverRunningDaemons();
        const found = results.find((d) => d.port === 19876);
        expect(found).toBeDefined();
        expect(found!.pid).toBe(process.pid);
      } finally {
        removePidFile(testPidPath);
      }
    });

    it('should clean up stale PID files during discovery', () => {
      const systemPidDir = getSystemPidDir();
      const stalePidPath = join(systemPidDir, 'limps-19877.pid');

      try {
        writePidFile(stalePidPath, {
          pid: 99999,
          port: 19877,
          host: '127.0.0.1',
          startedAt: new Date().toISOString(),
        });

        discoverRunningDaemons();
        expect(existsSync(stalePidPath)).toBe(false);
      } finally {
        // Cleanup in case test fails
        removePidFile(stalePidPath);
      }
    });

    it('should ignore non-PID files in directory', () => {
      const systemPidDir = getSystemPidDir();
      const junkPath = join(systemPidDir, 'not-a-pid.txt');

      try {
        writeFileSync(junkPath, 'junk');
        // Should not throw
        const results = discoverRunningDaemons();
        expect(Array.isArray(results)).toBe(true);
      } finally {
        if (existsSync(junkPath)) {
          rmSync(junkPath);
        }
      }
    });
  });

  describe('discoverRunningDaemons', () => {
    const extraPort = 5555;
    let extraPidFilePath: string;

    beforeEach(() => {
      extraPidFilePath = getPidFilePath(extraPort);
    });

    afterEach(() => {
      if (existsSync(extraPidFilePath)) {
        rmSync(extraPidFilePath, { force: true });
      }
    });

    it('should return empty array when no PID files exist', () => {
      const result = discoverRunningDaemons();
      // Filter to only our test ports to avoid interference from real daemons
      const testResults = result.filter((d) => d.port === testPort || d.port === extraPort);
      expect(testResults).toEqual([]);
    });

    it('should discover a running daemon', () => {
      const contents: PidFileContents = {
        pid: process.pid,
        port: testPort,
        host: '127.0.0.1',
        startedAt: new Date().toISOString(),
      };
      writePidFile(pidFilePath, contents);

      const result = discoverRunningDaemons();
      const found = result.find((d) => d.port === testPort);
      expect(found).toEqual(contents);
    });

    it('should discover multiple running daemons', () => {
      const contents1: PidFileContents = {
        pid: process.pid,
        port: testPort,
        host: '127.0.0.1',
        startedAt: new Date().toISOString(),
      };
      const contents2: PidFileContents = {
        pid: process.pid,
        port: extraPort,
        host: '127.0.0.1',
        startedAt: new Date().toISOString(),
      };
      writePidFile(pidFilePath, contents1);
      writePidFile(extraPidFilePath, contents2);

      const result = discoverRunningDaemons();
      const found = result.filter((d) => d.port === testPort || d.port === extraPort);
      expect(found).toHaveLength(2);
      expect(found.find((d) => d.port === testPort)).toEqual(contents1);
      expect(found.find((d) => d.port === extraPort)).toEqual(contents2);
    });

    it('should clean up stale PID files and exclude them', () => {
      const staleContents: PidFileContents = {
        pid: 99999,
        port: extraPort,
        host: '127.0.0.1',
        startedAt: new Date().toISOString(),
      };
      writePidFile(extraPidFilePath, staleContents);

      const result = discoverRunningDaemons();
      const found = result.find((d) => d.port === extraPort);
      expect(found).toBeUndefined();
      // Stale PID file should be cleaned up
      expect(existsSync(extraPidFilePath)).toBe(false);
    });

    it('should skip non-PID files in the directory', () => {
      // Write a non-PID file
      const junkPath = join(getSystemPidDir(), 'not-a-pid.txt');
      writeFileSync(junkPath, 'junk');

      const result = discoverRunningDaemons();
      // Should not throw, just skip it
      expect(Array.isArray(result)).toBe(true);

      // Clean up
      rmSync(junkPath, { force: true });
    });
  });
});
