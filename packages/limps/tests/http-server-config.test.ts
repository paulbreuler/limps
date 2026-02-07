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
  });
});
