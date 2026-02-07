/**
 * Rate limiter utility tests
 */

import { describe, it, expect } from 'vitest';
import { createRateLimiter } from '../../src/utils/rate-limiter.js';

describe('Rate Limiter', () => {
  describe('createRateLimiter', () => {
    it('should allow requests within limit', () => {
      const limiter = createRateLimiter(5, 60000);

      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed('192.168.1.1')).toBe(true);
      }
    });

    it('should block requests exceeding limit', () => {
      const limiter = createRateLimiter(3, 60000);

      // Make 3 allowed requests
      for (let i = 0; i < 3; i++) {
        expect(limiter.isAllowed('192.168.1.1')).toBe(true);
      }

      // 4th request should be blocked
      expect(limiter.isAllowed('192.168.1.1')).toBe(false);
    });

    it('should track different IPs separately', () => {
      const limiter = createRateLimiter(2, 60000);

      // Use up limit for IP 1
      expect(limiter.isAllowed('192.168.1.1')).toBe(true);
      expect(limiter.isAllowed('192.168.1.1')).toBe(true);
      expect(limiter.isAllowed('192.168.1.1')).toBe(false);

      // IP 2 should still have full quota
      expect(limiter.isAllowed('192.168.1.2')).toBe(true);
      expect(limiter.isAllowed('192.168.1.2')).toBe(true);
      expect(limiter.isAllowed('192.168.1.2')).toBe(false);
    });

    it('should report remaining requests correctly', () => {
      const limiter = createRateLimiter(5, 60000);

      expect(limiter.getRemaining('192.168.1.1')).toBe(5);

      limiter.isAllowed('192.168.1.1');
      expect(limiter.getRemaining('192.168.1.1')).toBe(4);

      limiter.isAllowed('192.168.1.1');
      expect(limiter.getRemaining('192.168.1.1')).toBe(3);
    });

    it('should reset to zero when limit exceeded', () => {
      const limiter = createRateLimiter(2, 60000);

      limiter.isAllowed('192.168.1.1');
      limiter.isAllowed('192.168.1.1');
      limiter.isAllowed('192.168.1.1'); // Exceeds limit

      expect(limiter.getRemaining('192.168.1.1')).toBe(0);
    });

    it('should reset all tracking when reset() called', () => {
      const limiter = createRateLimiter(2, 60000);

      limiter.isAllowed('192.168.1.1');
      limiter.isAllowed('192.168.1.1');
      expect(limiter.isAllowed('192.168.1.1')).toBe(false);

      limiter.reset();

      expect(limiter.isAllowed('192.168.1.1')).toBe(true);
    });

    it('should reset counter after window expires', async () => {
      const limiter = createRateLimiter(2, 100); // 100ms window

      limiter.isAllowed('192.168.1.1');
      limiter.isAllowed('192.168.1.1');
      expect(limiter.isAllowed('192.168.1.1')).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be allowed again
      expect(limiter.isAllowed('192.168.1.1')).toBe(true);
    });
  });
});
