/**
 * Simple in-memory rate limiter for HTTP requests.
 * Tracks requests per IP address within a time window.
 */

export interface RateLimiter {
  isAllowed(ip: string): boolean;
  getRemaining(ip: string): number;
  reset(): void;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * Create a rate limiter with the specified configuration.
 *
 * @param maxRequests - Maximum requests allowed per window
 * @param windowMs - Time window in milliseconds
 * @returns RateLimiter instance
 */
export function createRateLimiter(maxRequests: number, windowMs: number): RateLimiter {
  const requests = new Map<string, RateLimitEntry>();

  function getEntry(ip: string): RateLimitEntry {
    const now = Date.now();
    const existing = requests.get(ip);

    if (!existing || now > existing.resetTime) {
      // Create new entry or reset expired entry
      const entry: RateLimitEntry = {
        count: 0,
        resetTime: now + windowMs,
      };
      requests.set(ip, entry);
      return entry;
    }

    return existing;
  }

  function cleanup(): void {
    const now = Date.now();
    for (const [ip, entry] of requests) {
      if (now > entry.resetTime) {
        requests.delete(ip);
      }
    }
  }

  // Periodically cleanup expired entries (every 5 minutes)
  const cleanupInterval = setInterval(cleanup, 5 * 60 * 1000);

  // Prevent the interval from keeping the process alive
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return {
    isAllowed(ip: string): boolean {
      const entry = getEntry(ip);
      if (entry.count >= maxRequests) {
        return false;
      }
      entry.count++;
      return true;
    },

    getRemaining(ip: string): number {
      const entry = getEntry(ip);
      return Math.max(0, maxRequests - entry.count);
    },

    reset(): void {
      requests.clear();
    },
  };
}
