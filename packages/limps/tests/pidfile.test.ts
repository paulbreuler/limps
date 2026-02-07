import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getPidFilePath,
  writePidFile,
  readPidFile,
  removePidFile,
  isProcessRunning,
  getRunningDaemon,
  type PidFileContents,
} from '../src/pidfile.js';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('pidfile', () => {
  let testDir: string;
  let pidFilePath: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `limps-pidfile-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    pidFilePath = getPidFilePath(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getPidFilePath', () => {
    it('should return correct path for data directory', () => {
      const path = getPidFilePath('/data/limps');
      expect(path).toBe('/data/limps/limps.pid');
    });

    it('should handle relative paths', () => {
      const path = getPidFilePath('./data');
      // join() normalizes './data' to 'data'
      expect(path).toBe('data/limps.pid');
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
      const nestedDir = join(testDir, 'nested', 'path');
      const nestedPidPath = getPidFilePath(nestedDir);

      const contents: PidFileContents = {
        pid: 12345,
        port: 4269,
        host: '127.0.0.1',
        startedAt: new Date().toISOString(),
      };

      writePidFile(nestedPidPath, contents);

      expect(existsSync(nestedPidPath)).toBe(true);
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
      // PID 99999 is very unlikely to exist
      expect(isProcessRunning(99999)).toBe(false);
    });
  });

  describe('getRunningDaemon', () => {
    it('should return null if no PID file exists', () => {
      const result = getRunningDaemon(pidFilePath);
      expect(result).toBeNull();
    });

    it('should return null and clean up stale PID file', () => {
      // Write PID file with non-existent process
      writePidFile(pidFilePath, {
        pid: 99999,
        port: 4269,
        host: '127.0.0.1',
        startedAt: new Date().toISOString(),
      });

      const result = getRunningDaemon(pidFilePath);
      expect(result).toBeNull();
      expect(existsSync(pidFilePath)).toBe(false); // Should be cleaned up
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
      expect(existsSync(pidFilePath)).toBe(true); // Should not be removed
    });
  });
});
