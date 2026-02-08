/**
 * Unit tests for HTTP client utilities.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createServer,
  type Server as HttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'http';
import {
  checkDaemonHealth,
  isDaemonHealthy,
  type HealthCheckResponse,
} from '../../src/utils/http-client.js';

describe('http-client', () => {
  let server: HttpServer | null = null;
  let port = 0;

  beforeEach(async () => {
    // Find an available port by letting the OS assign one
    await new Promise<void>((resolve) => {
      server = createServer();
      server.listen(0, '127.0.0.1', () => {
        const addr = server!.address();
        if (addr && typeof addr === 'object') {
          port = addr.port;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
      server = null;
    }
  });

  describe('checkDaemonHealth', () => {
    it('should return ok:true for valid health response', async () => {
      const healthResponse: HealthCheckResponse = {
        status: 'ok',
        sessions: 2,
        uptime: 123,
        pid: process.pid,
        sessionTimeoutMs: 30000,
      };

      server!.on('request', (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthResponse));
      });

      const result = await checkDaemonHealth('127.0.0.1', port);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(healthResponse);
        expect(result.statusCode).toBe(200);
      }
    });

    it('should validate required fields in health response', async () => {
      server!.on('request', (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', sessions: 1 })); // Missing uptime, pid
      });

      const result = await checkDaemonHealth('127.0.0.1', port);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_RESPONSE');
        expect(result.error.message).toContain('missing required fields');
      }
    });

    it('should handle optional sessionTimeoutMs field', async () => {
      const healthResponse: HealthCheckResponse = {
        status: 'ok',
        sessions: 0,
        uptime: 42,
        pid: 1234,
        // sessionTimeoutMs is optional
      };

      server!.on('request', (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthResponse));
      });

      const result = await checkDaemonHealth('127.0.0.1', port);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.sessionTimeoutMs).toBeUndefined();
      }
    });

    it('should return NETWORK_ERROR for connection refused', async () => {
      const unusedPort = 59999; // Port where nothing is listening

      const result = await checkDaemonHealth('127.0.0.1', unusedPort, { timeout: 500 });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NETWORK_ERROR');
        expect(result.error.message).toContain('ECONNREFUSED');
      }
    });

    it('should return TIMEOUT for slow responses', async () => {
      server!.on('request', (_req: IncomingMessage, _res: ServerResponse) => {
        // Never respond — simulate slow server
      });

      const startTime = Date.now();
      const result = await checkDaemonHealth('127.0.0.1', port, { timeout: 500 });
      const duration = Date.now() - startTime;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TIMEOUT');
        expect(result.error.message).toContain('timed out');
      }

      // Verify it actually waited around the timeout duration (allow 100ms margin)
      expect(duration).toBeGreaterThanOrEqual(400);
      expect(duration).toBeLessThan(700);
    });

    it('should return NON_200_STATUS for server errors', async () => {
      server!.on('request', (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      });

      const result = await checkDaemonHealth('127.0.0.1', port);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NON_200_STATUS');
        expect(result.error.statusCode).toBe(500);
      }
    });

    it('should return INVALID_RESPONSE for malformed JSON', async () => {
      server!.on('request', (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('This is not JSON');
      });

      const result = await checkDaemonHealth('127.0.0.1', port);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_RESPONSE');
        expect(result.error.message).toContain('parse JSON');
      }
    });

    it('should retry on NETWORK_ERROR when configured', async () => {
      const unusedPort = 59998;
      const logs: string[] = [];

      const startTime = Date.now();
      const result = await checkDaemonHealth('127.0.0.1', unusedPort, {
        timeout: 200,
        retries: 2,
        retryDelay: 100,
        logger: (msg) => logs.push(msg),
      });
      const duration = Date.now() - startTime;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NETWORK_ERROR');
      }

      // Verify retry attempts in logs
      const attemptLogs = logs.filter((log) => log.includes('HTTP GET'));
      expect(attemptLogs.length).toBe(3); // Initial + 2 retries

      const retryLogs = logs.filter((log) => log.includes('Retry attempt'));
      expect(retryLogs.length).toBe(2);

      // Verify retry delays were applied (2 * 100ms = 200ms minimum, allow margin)
      expect(duration).toBeGreaterThanOrEqual(200);
    });

    it('should retry on TIMEOUT when configured', async () => {
      server!.on('request', (_req: IncomingMessage, _res: ServerResponse) => {
        // Never respond
      });

      const logs: string[] = [];
      const result = await checkDaemonHealth('127.0.0.1', port, {
        timeout: 200,
        retries: 1,
        retryDelay: 50,
        logger: (msg) => logs.push(msg),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TIMEOUT');
      }

      const attemptLogs = logs.filter((log) => log.includes('HTTP GET'));
      expect(attemptLogs.length).toBe(2); // Initial + 1 retry
    });

    it('should not retry on NON_200_STATUS by default', async () => {
      server!.on('request', (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('Service Unavailable');
      });

      const logs: string[] = [];
      const result = await checkDaemonHealth('127.0.0.1', port, {
        retries: 2,
        logger: (msg) => logs.push(msg),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NON_200_STATUS');
      }

      // Should not retry
      const attemptLogs = logs.filter((log) => log.includes('HTTP'));
      expect(attemptLogs.length).toBe(2); // Initial request only (GET + status code)
    });

    it('should not retry on INVALID_RESPONSE by default', async () => {
      server!.on('request', (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('invalid json');
      });

      const logs: string[] = [];
      const result = await checkDaemonHealth('127.0.0.1', port, {
        retries: 2,
        logger: (msg) => logs.push(msg),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_RESPONSE');
      }

      // Should not retry
      const attemptLogs = logs.filter((log) => log.includes('HTTP'));
      expect(attemptLogs.length).toBe(2); // GET + response
    });

    it('should support custom retryOn configuration', async () => {
      server!.on('request', (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(503);
        res.end();
      });

      const logs: string[] = [];
      const result = await checkDaemonHealth('127.0.0.1', port, {
        retries: 1,
        retryDelay: 50,
        retryOn: ['NON_200_STATUS'], // Custom retry condition
        logger: (msg) => logs.push(msg),
      });

      expect(result.ok).toBe(false);

      // Should have retried because NON_200_STATUS is in retryOn
      const attemptLogs = logs.filter((log) => log.includes('HTTP GET'));
      expect(attemptLogs.length).toBe(2); // Initial + 1 retry
    });

    it('should call logger for each request when provided', async () => {
      server!.on('request', (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', sessions: 0, uptime: 1, pid: 1 }));
      });

      const logs: string[] = [];
      await checkDaemonHealth('127.0.0.1', port, {
        logger: (msg) => logs.push(msg),
      });

      expect(logs.length).toBeGreaterThanOrEqual(2);
      expect(logs[0]).toContain('HTTP GET');
      expect(logs[1]).toContain('HTTP 200');
      expect(logs[1]).toMatch(/\d+ms/); // Duration in milliseconds
    });

    it('should use default timeout of 3000ms', async () => {
      server!.on('request', (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', sessions: 0, uptime: 1, pid: 1 }));
      });

      // Don't specify timeout, should use default
      const result = await checkDaemonHealth('127.0.0.1', port);

      expect(result.ok).toBe(true);
    });

    it('should handle response validation with wrong types', async () => {
      server!.on('request', (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            sessions: 'two', // Wrong type (should be number)
            uptime: 123,
            pid: 456,
          })
        );
      });

      const result = await checkDaemonHealth('127.0.0.1', port);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_RESPONSE');
      }
    });
  });

  describe('isDaemonHealthy', () => {
    it('should return true for healthy daemon', async () => {
      server!.on('request', (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', sessions: 0, uptime: 1, pid: 1 }));
      });

      const result = await isDaemonHealthy('127.0.0.1', port);

      expect(result).toBe(true);
    });

    it('should return false for NETWORK_ERROR', async () => {
      const unusedPort = 59997;

      const result = await isDaemonHealthy('127.0.0.1', unusedPort, { timeout: 200 });

      expect(result).toBe(false);
    });

    it('should return false for TIMEOUT', async () => {
      server!.on('request', (_req: IncomingMessage, _res: ServerResponse) => {
        // Never respond
      });

      const result = await isDaemonHealthy('127.0.0.1', port, { timeout: 200 });

      expect(result).toBe(false);
    });

    it('should return false for NON_200_STATUS', async () => {
      server!.on('request', (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(500);
        res.end();
      });

      const result = await isDaemonHealthy('127.0.0.1', port);

      expect(result).toBe(false);
    });

    it('should return false for INVALID_RESPONSE', async () => {
      server!.on('request', (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200);
        res.end('not json');
      });

      const result = await isDaemonHealthy('127.0.0.1', port);

      expect(result).toBe(false);
    });

    it('should return false for non-ok status in response', async () => {
      server!.on('request', (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', sessions: 0, uptime: 1, pid: 1 }));
      });

      const result = await isDaemonHealthy('127.0.0.1', port);

      expect(result).toBe(false);
    });

    it('should support custom HttpClientOptions', async () => {
      server!.on('request', (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', sessions: 0, uptime: 1, pid: 1 }));
      });

      const logs: string[] = [];
      const result = await isDaemonHealthy('127.0.0.1', port, {
        timeout: 1000,
        logger: (msg) => logs.push(msg),
      });

      expect(result).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
    });
  });
});
