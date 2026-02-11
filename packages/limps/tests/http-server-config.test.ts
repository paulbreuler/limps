import { describe, it, expect } from 'vitest';
import { getHttpServerConfig, type ServerConfig } from '../src/config.js';

describe('http-server-config', () => {
  const baseConfig: ServerConfig = {
    plansPath: './plans',
    dataPath: './data',
    scoring: {
      weights: { dependency: 40, priority: 30, workload: 30 },
      biases: {},
    },
  };

  describe('getHttpServerConfig', () => {
    it('should return defaults when no server config provided', () => {
      const result = getHttpServerConfig(baseConfig);

      expect(result).toEqual({
        port: 4269,
        host: '127.0.0.1',
        maxBodySize: 10 * 1024 * 1024, // 10MB
        maxSessions: 100,
        corsOrigin: '',
        rateLimit: {
          maxRequests: 100,
          windowMs: 60000,
        },
        sessionTimeoutMs: 30 * 60 * 1000,
      });
    });

    it('should merge custom port', () => {
      const config: ServerConfig = {
        ...baseConfig,
        server: { port: 8080 },
      };

      const result = getHttpServerConfig(config);
      expect(result.port).toBe(8080);
      expect(result.host).toBe('127.0.0.1');
    });

    it('should merge custom host', () => {
      const config: ServerConfig = {
        ...baseConfig,
        server: { host: '0.0.0.0' },
      };

      const result = getHttpServerConfig(config);
      expect(result.host).toBe('0.0.0.0');
      expect(result.port).toBe(4269);
    });

    it('should accept localhost as host', () => {
      const config: ServerConfig = {
        ...baseConfig,
        server: { host: 'localhost' },
      };

      const result = getHttpServerConfig(config);
      expect(result.host).toBe('localhost');
    });

    it('should accept IPv6 loopback', () => {
      const config: ServerConfig = {
        ...baseConfig,
        server: { host: '::1' },
      };

      const result = getHttpServerConfig(config);
      expect(result.host).toBe('::1');
    });

    it('should throw for invalid host format', () => {
      const config: ServerConfig = {
        ...baseConfig,
        server: { host: 'not a valid host!' },
      };

      expect(() => getHttpServerConfig(config)).toThrow(/Invalid HTTP server host/);
    });

    it('should throw for port below 1', () => {
      const config: ServerConfig = {
        ...baseConfig,
        server: { port: 0 },
      };

      expect(() => getHttpServerConfig(config)).toThrow(/Invalid HTTP server port/);
    });

    it('should throw for port above 65535', () => {
      const config: ServerConfig = {
        ...baseConfig,
        server: { port: 70000 },
      };

      expect(() => getHttpServerConfig(config)).toThrow(/Invalid HTTP server port/);
    });

    it('should accept port 1', () => {
      const config: ServerConfig = {
        ...baseConfig,
        server: { port: 1 },
      };

      const result = getHttpServerConfig(config);
      expect(result.port).toBe(1);
    });

    it('should accept port 65535', () => {
      const config: ServerConfig = {
        ...baseConfig,
        server: { port: 65535 },
      };

      const result = getHttpServerConfig(config);
      expect(result.port).toBe(65535);
    });

    it('should accept FQDN hostnames', () => {
      const config: ServerConfig = {
        ...baseConfig,
        server: { host: 'limps.example.com' },
      };

      const result = getHttpServerConfig(config);
      expect(result.host).toBe('limps.example.com');
    });

    it('should accept valid IPv6 addresses', () => {
      expect(() =>
        getHttpServerConfig({
          ...baseConfig,
          server: { host: '::1' },
        })
      ).not.toThrow();

      expect(() =>
        getHttpServerConfig({
          ...baseConfig,
          server: { host: '2001:db8::1' },
        })
      ).not.toThrow();
    });

    it('should reject invalid IPv6 addresses', () => {
      expect(() =>
        getHttpServerConfig({
          ...baseConfig,
          server: { host: '::::' },
        })
      ).toThrow('Invalid HTTP server host');

      expect(() =>
        getHttpServerConfig({
          ...baseConfig,
          server: { host: ':::1' },
        })
      ).toThrow('Invalid HTTP server host');
    });
  });

  describe('maxBodySize configuration', () => {
    it('should use default maxBodySize of 10MB', () => {
      const result = getHttpServerConfig(baseConfig);
      expect(result.maxBodySize).toBe(10 * 1024 * 1024);
    });

    it('should allow custom maxBodySize', () => {
      const result = getHttpServerConfig({
        ...baseConfig,
        server: { maxBodySize: 5 * 1024 * 1024 },
      });
      expect(result.maxBodySize).toBe(5 * 1024 * 1024);
    });

    it('should reject maxBodySize less than 1KB', () => {
      expect(() =>
        getHttpServerConfig({
          ...baseConfig,
          server: { maxBodySize: 512 },
        })
      ).toThrow('Invalid HTTP server maxBodySize');
    });

    it('should reject maxBodySize greater than 100MB', () => {
      expect(() =>
        getHttpServerConfig({
          ...baseConfig,
          server: { maxBodySize: 200 * 1024 * 1024 },
        })
      ).toThrow('Invalid HTTP server maxBodySize');
    });
  });

  describe('maxSessions configuration', () => {
    it('should use default maxSessions of 100', () => {
      const result = getHttpServerConfig(baseConfig);
      expect(result.maxSessions).toBe(100);
    });

    it('should allow custom maxSessions', () => {
      const result = getHttpServerConfig({
        ...baseConfig,
        server: { maxSessions: 50 },
      });
      expect(result.maxSessions).toBe(50);
    });

    it('should reject maxSessions less than 1', () => {
      expect(() =>
        getHttpServerConfig({
          ...baseConfig,
          server: { maxSessions: 0 },
        })
      ).toThrow('Invalid HTTP server maxSessions');
    });

    it('should reject maxSessions greater than 1000', () => {
      expect(() =>
        getHttpServerConfig({
          ...baseConfig,
          server: { maxSessions: 2000 },
        })
      ).toThrow('Invalid HTTP server maxSessions');
    });
  });

  describe('sessionTimeoutMs configuration', () => {
    it('should use default sessionTimeoutMs of 30 minutes', () => {
      const result = getHttpServerConfig(baseConfig);
      expect(result.sessionTimeoutMs).toBe(30 * 60 * 1000);
    });

    it('should allow custom sessionTimeoutMs', () => {
      const result = getHttpServerConfig({
        ...baseConfig,
        server: { sessionTimeoutMs: 10 * 60 * 1000 },
      });
      expect(result.sessionTimeoutMs).toBe(10 * 60 * 1000);
    });

    it('should reject sessionTimeoutMs less than 1 minute', () => {
      expect(() =>
        getHttpServerConfig({
          ...baseConfig,
          server: { sessionTimeoutMs: 30_000 },
        })
      ).toThrow('Invalid HTTP server sessionTimeoutMs');
    });

    it('should reject sessionTimeoutMs greater than 24 hours', () => {
      expect(() =>
        getHttpServerConfig({
          ...baseConfig,
          server: { sessionTimeoutMs: 100_000_000 },
        })
      ).toThrow('Invalid HTTP server sessionTimeoutMs');
    });

    it('should accept boundary value of 60000 (1 min)', () => {
      const result = getHttpServerConfig({
        ...baseConfig,
        server: { sessionTimeoutMs: 60_000 },
      });
      expect(result.sessionTimeoutMs).toBe(60_000);
    });

    it('should accept boundary value of 86400000 (24 hr)', () => {
      const result = getHttpServerConfig({
        ...baseConfig,
        server: { sessionTimeoutMs: 86_400_000 },
      });
      expect(result.sessionTimeoutMs).toBe(86_400_000);
    });

    it('should accept 0 to disable session timeout', () => {
      const result = getHttpServerConfig({
        ...baseConfig,
        server: { sessionTimeoutMs: 0 },
      });
      expect(result.sessionTimeoutMs).toBe(0);
    });
  });

  describe('corsOrigin configuration', () => {
    it('should use default corsOrigin of empty string (no CORS)', () => {
      const result = getHttpServerConfig(baseConfig);
      expect(result.corsOrigin).toBe('');
    });

    it('should accept empty string as valid corsOrigin', () => {
      const result = getHttpServerConfig({
        ...baseConfig,
        server: { corsOrigin: '' },
      });
      expect(result.corsOrigin).toBe('');
    });

    it('should accept wildcard as corsOrigin', () => {
      const result = getHttpServerConfig({
        ...baseConfig,
        server: { corsOrigin: '*' },
      });
      expect(result.corsOrigin).toBe('*');
    });

    it('should allow custom corsOrigin', () => {
      const result = getHttpServerConfig({
        ...baseConfig,
        server: { corsOrigin: 'http://localhost:3000' },
      });
      expect(result.corsOrigin).toBe('http://localhost:3000');
    });

    it('should allow localhost with scheme as corsOrigin', () => {
      const result = getHttpServerConfig({
        ...baseConfig,
        server: { corsOrigin: 'http://localhost' },
      });
      expect(result.corsOrigin).toBe('http://localhost');
    });

    it('should reject invalid corsOrigin', () => {
      expect(() =>
        getHttpServerConfig({
          ...baseConfig,
          server: { corsOrigin: 'not a valid url' },
        })
      ).toThrow('Invalid HTTP server corsOrigin');
    });
  });

  describe('rateLimit configuration', () => {
    it('should use default rate limit configuration', () => {
      const result = getHttpServerConfig(baseConfig);
      expect(result.rateLimit).toEqual({
        maxRequests: 100,
        windowMs: 60000,
      });
    });

    it('should allow custom rate limit configuration', () => {
      const result = getHttpServerConfig({
        ...baseConfig,
        server: { rateLimit: { maxRequests: 50, windowMs: 30000 } },
      });
      expect(result.rateLimit).toEqual({
        maxRequests: 50,
        windowMs: 30000,
      });
    });
  });
});
