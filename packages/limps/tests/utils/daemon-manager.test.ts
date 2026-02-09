import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ensureDaemonRunning } from '../../src/utils/daemon-manager.js';
import * as pidfile from '../../src/pidfile.js';
import * as httpClient from '../../src/utils/http-client.js';
import * as config from '../../src/config.js';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync, existsSync } from 'fs';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('daemon-manager', () => {
  let testPidDir: string;
  let mockSpawn: ReturnType<typeof vi.fn>;
  let mockChild: Partial<ChildProcess>;

  beforeEach(() => {
    // Create isolated temp directory
    testPidDir = join(
      tmpdir(),
      `test-daemon-manager-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testPidDir, { recursive: true });

    // Mock spawn to return a mock child process
    mockChild = {
      unref: vi.fn(),
    };
    mockSpawn = vi.mocked(spawn);
    mockSpawn.mockReturnValue(mockChild as ChildProcess);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (existsSync(testPidDir)) {
      rmSync(testPidDir, { recursive: true, force: true });
    }
  });

  describe('ensureDaemonRunning', () => {
    it('should return existing daemon if healthy', async () => {
      const existingDaemon: pidfile.PidFileContents = {
        pid: process.pid,
        port: 4269,
        host: '127.0.0.1',
        startedAt: new Date().toISOString(),
      };

      // Mock existing daemon
      vi.spyOn(config, 'loadConfig').mockReturnValue({
        plansPath: '/tmp/plans',
        dataPath: '/tmp/data',
      } as config.ServerConfig);

      vi.spyOn(config, 'getHttpServerConfig').mockReturnValue({
        port: 4269,
        host: '127.0.0.1',
      });

      vi.spyOn(pidfile, 'getPidFilePath').mockReturnValue('/tmp/test.pid');
      vi.spyOn(pidfile, 'getRunningDaemon').mockReturnValue(existingDaemon);
      vi.spyOn(httpClient, 'isDaemonHealthy').mockResolvedValue(true);

      const result = await ensureDaemonRunning('/tmp/config.json');

      expect(result).toEqual({
        host: existingDaemon.host,
        port: existingDaemon.port,
        pid: existingDaemon.pid,
      });

      // Should not spawn a new daemon
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should start daemon if not running', async () => {
      const newDaemon: pidfile.PidFileContents = {
        pid: 12345,
        port: 4269,
        host: '127.0.0.1',
        startedAt: new Date().toISOString(),
      };

      vi.spyOn(config, 'loadConfig').mockReturnValue({
        plansPath: '/tmp/plans',
        dataPath: '/tmp/data',
      } as config.ServerConfig);

      vi.spyOn(config, 'getHttpServerConfig').mockReturnValue({
        port: 4269,
        host: '127.0.0.1',
      });

      vi.spyOn(pidfile, 'getPidFilePath').mockReturnValue('/tmp/test.pid');

      // First call: no daemon, second call after spawn: daemon exists
      const getRunningDaemonMock = vi.spyOn(pidfile, 'getRunningDaemon');
      getRunningDaemonMock.mockReturnValueOnce(null); // Initial check
      getRunningDaemonMock.mockReturnValue(newDaemon); // After spawn

      vi.spyOn(httpClient, 'isDaemonHealthy').mockResolvedValue(true);

      const result = await ensureDaemonRunning('/tmp/config.json', 5000);

      expect(result).toEqual({
        host: newDaemon.host,
        port: newDaemon.port,
        pid: newDaemon.pid,
      });

      // Should spawn a new daemon
      expect(mockSpawn).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['start', '--config', '/tmp/config.json']),
        {
          detached: true,
          stdio: 'ignore',
        }
      );
      expect(mockChild.unref).toHaveBeenCalled();
    });

    it('should retry health checks until daemon is ready', async () => {
      const newDaemon: pidfile.PidFileContents = {
        pid: 12345,
        port: 4269,
        host: '127.0.0.1',
        startedAt: new Date().toISOString(),
      };

      vi.spyOn(config, 'loadConfig').mockReturnValue({
        plansPath: '/tmp/plans',
        dataPath: '/tmp/data',
      } as config.ServerConfig);

      vi.spyOn(config, 'getHttpServerConfig').mockReturnValue({
        port: 4269,
        host: '127.0.0.1',
      });

      vi.spyOn(pidfile, 'getPidFilePath').mockReturnValue('/tmp/test.pid');

      const getRunningDaemonMock = vi.spyOn(pidfile, 'getRunningDaemon');
      getRunningDaemonMock.mockReturnValueOnce(null); // Initial check
      getRunningDaemonMock.mockReturnValueOnce(null); // First poll (no PID yet)
      getRunningDaemonMock.mockReturnValue(newDaemon); // Second poll (PID exists)

      const isDaemonHealthyMock = vi.spyOn(httpClient, 'isDaemonHealthy');
      isDaemonHealthyMock.mockResolvedValueOnce(false); // First health check fails
      isDaemonHealthyMock.mockResolvedValue(true); // Second health check succeeds

      const result = await ensureDaemonRunning('/tmp/config.json', 5000);

      expect(result).toEqual({
        host: newDaemon.host,
        port: newDaemon.port,
        pid: newDaemon.pid,
      });

      // Health check should be called multiple times
      expect(isDaemonHealthyMock).toHaveBeenCalled();
    });

    it('should throw error if daemon does not start within timeout', async () => {
      vi.spyOn(config, 'loadConfig').mockReturnValue({
        plansPath: '/tmp/plans',
        dataPath: '/tmp/data',
      } as config.ServerConfig);

      vi.spyOn(config, 'getHttpServerConfig').mockReturnValue({
        port: 4269,
        host: '127.0.0.1',
      });

      vi.spyOn(pidfile, 'getPidFilePath').mockReturnValue('/tmp/test.pid');
      vi.spyOn(pidfile, 'getRunningDaemon').mockReturnValue(null); // Never returns daemon
      vi.spyOn(httpClient, 'isDaemonHealthy').mockResolvedValue(false);

      await expect(ensureDaemonRunning('/tmp/config.json', 1000)).rejects.toThrow(
        'Failed to start daemon within 1000ms'
      );

      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should handle unhealthy existing daemon', async () => {
      const staleDaemon: pidfile.PidFileContents = {
        pid: process.pid,
        port: 4269,
        host: '127.0.0.1',
        startedAt: new Date().toISOString(),
      };

      const newDaemon: pidfile.PidFileContents = {
        pid: 12345,
        port: 4269,
        host: '127.0.0.1',
        startedAt: new Date().toISOString(),
      };

      vi.spyOn(config, 'loadConfig').mockReturnValue({
        plansPath: '/tmp/plans',
        dataPath: '/tmp/data',
      } as config.ServerConfig);

      vi.spyOn(config, 'getHttpServerConfig').mockReturnValue({
        port: 4269,
        host: '127.0.0.1',
      });

      vi.spyOn(pidfile, 'getPidFilePath').mockReturnValue('/tmp/test.pid');

      const getRunningDaemonMock = vi.spyOn(pidfile, 'getRunningDaemon');
      getRunningDaemonMock.mockReturnValueOnce(staleDaemon); // Existing but unhealthy
      getRunningDaemonMock.mockReturnValue(newDaemon); // After spawn

      const isDaemonHealthyMock = vi.spyOn(httpClient, 'isDaemonHealthy');
      isDaemonHealthyMock.mockResolvedValueOnce(false); // Existing daemon is unhealthy
      isDaemonHealthyMock.mockResolvedValue(true); // New daemon is healthy

      const result = await ensureDaemonRunning('/tmp/config.json', 5000);

      expect(result).toEqual({
        host: newDaemon.host,
        port: newDaemon.port,
        pid: newDaemon.pid,
      });

      // Should spawn a new daemon
      expect(mockSpawn).toHaveBeenCalled();
    });
  });
});
