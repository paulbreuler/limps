/**
 * TTL (Time-To-Live) checking logic for cache expiration.
 */

/**
 * TTL constants in milliseconds.
 */
export const TTL = {
  /**
   * TTL for versioned primitive data (7 days).
   * Versioned data is stable and can be cached longer.
   */
  VERSION_DATA: 7 * 24 * 60 * 60 * 1000,

  /**
   * TTL for "latest" version resolution (1 hour).
   * Latest version can change frequently, so we check more often.
   */
  LATEST_RESOLUTION: 60 * 60 * 1000,

  /**
   * TTL for signature data (same as version data).
   * Signatures derived from versioned data inherit the same TTL.
   */
  SIGNATURE_DATA: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Check if a timestamp has expired based on TTL.
 * @param timestamp - ISO timestamp string
 * @param ttlMs - Time-to-live in milliseconds
 * @returns True if the data has expired
 */
export function isExpired(timestamp: string, ttlMs: number): boolean {
  const cachedTime = new Date(timestamp).getTime();
  const now = Date.now();
  const age = now - cachedTime;
  return age >= ttlMs;
}

/**
 * Check if version data has expired.
 * @param timestamp - ISO timestamp string (extractedAt)
 * @returns True if the version data has expired
 */
export function isVersionDataExpired(timestamp: string): boolean {
  return isExpired(timestamp, TTL.VERSION_DATA);
}

/**
 * Check if "latest" resolution has expired.
 * @param timestamp - ISO timestamp string (resolvedAt)
 * @returns True if the latest resolution has expired
 */
export function isLatestResolutionExpired(timestamp: string): boolean {
  return isExpired(timestamp, TTL.LATEST_RESOLUTION);
}

/**
 * Check if signature data has expired.
 * @param timestamp - ISO timestamp string
 * @returns True if the signature data has expired
 */
export function isSignatureExpired(timestamp: string): boolean {
  return isExpired(timestamp, TTL.SIGNATURE_DATA);
}

/**
 * Get the remaining TTL for cached data.
 * @param timestamp - ISO timestamp string
 * @param ttlMs - Time-to-live in milliseconds
 * @returns Remaining time in milliseconds (negative if expired)
 */
export function getRemainingTtl(timestamp: string, ttlMs: number): number {
  const cachedTime = new Date(timestamp).getTime();
  const now = Date.now();
  const age = now - cachedTime;
  return ttlMs - age;
}

/**
 * Format remaining TTL as human-readable string.
 * @param remainingMs - Remaining time in milliseconds
 * @returns Human-readable string like "2 days", "3 hours", "expired"
 */
export function formatRemainingTtl(remainingMs: number): string {
  if (remainingMs <= 0) {
    return 'expired';
  }

  const seconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (hours > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
}
