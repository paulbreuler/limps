/**
 * HTTP server security tests
 * Tests for body size limits, rate limiting, and session management
 */

import { describe, it, expect } from 'vitest';
import { getHttpServerConfig } from '../src/config.js';

describe('HTTP server security', () => {
  describe('maxBodySize configuration', () => {
    it('should use default maxBodySize of 10MB', () => {
      const config = getHttpServerConfig({
        plansPath: '/tmp/plans',
        dataPath: '/tmp/data',
        scoring: { weights: {}, biases: {} },
      });
      expect(config.maxBodySize).toBe(10 * 1024 * 1024);
    });

    it('should allow custom maxBodySize', () => {
      const config = getHttpServerConfig({
        plansPath: '/tmp/plans',
        dataPath: '/tmp/data',
        scoring: { weights: {}, biases: {} },
        server: { maxBodySize: 5 * 1024 * 1024 },
      });
      expect(config.maxBodySize).toBe(5 * 1024 * 1024);
    });

    it('should reject maxBodySize less than 1KB', () => {
      expect(() =>
        getHttpServerConfig({
          plansPath: '/tmp/plans',
          dataPath: '/tmp/data',
          scoring: { weights: {}, biases: {} },
          server: { maxBodySize: 512 },
        })
      ).toThrow('Invalid HTTP server maxBodySize');
    });

    it('should reject maxBodySize greater than 100MB', () => {
      expect(() =>
        getHttpServerConfig({
          plansPath: '/tmp/plans',
          dataPath: '/tmp/data',
          scoring: { weights: {}, biases: {} },
          server: { maxBodySize: 200 * 1024 * 1024 },
        })
      ).toThrow('Invalid HTTP server maxBodySize');
    });
  });

  describe('maxSessions configuration', () => {
    it('should use default maxSessions of 100', () => {
      const config = getHttpServerConfig({
        plansPath: '/tmp/plans',
        dataPath: '/tmp/data',
        scoring: { weights: {}, biases: {} },
      });
      expect(config.maxSessions).toBe(100);
    });

    it('should allow custom maxSessions', () => {
      const config = getHttpServerConfig({
        plansPath: '/tmp/plans',
        dataPath: '/tmp/data',
        scoring: { weights: {}, biases: {} },
        server: { maxSessions: 50 },
      });
      expect(config.maxSessions).toBe(50);
    });

    it('should reject maxSessions less than 1', () => {
      expect(() =>
        getHttpServerConfig({
          plansPath: '/tmp/plans',
          dataPath: '/tmp/data',
          scoring: { weights: {}, biases: {} },
          server: { maxSessions: 0 },
        })
      ).toThrow('Invalid HTTP server maxSessions');
    });

    it('should reject maxSessions greater than 1000', () => {
      expect(() =>
        getHttpServerConfig({
          plansPath: '/tmp/plans',
          dataPath: '/tmp/data',
          scoring: { weights: {}, biases: {} },
          server: { maxSessions: 2000 },
        })
      ).toThrow('Invalid HTTP server maxSessions');
    });
  });

  describe('corsOrigin configuration', () => {
    it('should use default corsOrigin of *', () => {
      const config = getHttpServerConfig({
        plansPath: '/tmp/plans',
        dataPath: '/tmp/data',
        scoring: { weights: {}, biases: {} },
      });
      expect(config.corsOrigin).toBe('*');
    });

    it('should allow custom corsOrigin', () => {
      const config = getHttpServerConfig({
        plansPath: '/tmp/plans',
        dataPath: '/tmp/data',
        scoring: { weights: {}, biases: {} },
        server: { corsOrigin: 'http://localhost:3000' },
      });
      expect(config.corsOrigin).toBe('http://localhost:3000');
    });

    it('should allow localhost with scheme as corsOrigin', () => {
      const config = getHttpServerConfig({
        plansPath: '/tmp/plans',
        dataPath: '/tmp/data',
        scoring: { weights: {}, biases: {} },
        server: { corsOrigin: 'http://localhost' },
      });
      expect(config.corsOrigin).toBe('http://localhost');
    });

    it('should reject invalid corsOrigin', () => {
      expect(() =>
        getHttpServerConfig({
          plansPath: '/tmp/plans',
          dataPath: '/tmp/data',
          scoring: { weights: {}, biases: {} },
          server: { corsOrigin: 'not a valid url' },
        })
      ).toThrow('Invalid HTTP server corsOrigin');
    });
  });

  describe('rateLimit configuration', () => {
    it('should use default rate limit configuration', () => {
      const config = getHttpServerConfig({
        plansPath: '/tmp/plans',
        dataPath: '/tmp/data',
        scoring: { weights: {}, biases: {} },
      });
      expect(config.rateLimit).toEqual({
        maxRequests: 100,
        windowMs: 60000,
      });
    });

    it('should allow custom rate limit configuration', () => {
      const config = getHttpServerConfig({
        plansPath: '/tmp/plans',
        dataPath: '/tmp/data',
        scoring: { weights: {}, biases: {} },
        server: { rateLimit: { maxRequests: 50, windowMs: 30000 } },
      });
      expect(config.rateLimit).toEqual({
        maxRequests: 50,
        windowMs: 30000,
      });
    });
  });
});
