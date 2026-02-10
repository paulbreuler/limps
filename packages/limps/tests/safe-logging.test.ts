import { describe, expect, it } from 'vitest';
import { sanitizeOperationalMessage, summarizeForLog } from '../src/utils/safe-logging.js';

describe('safe-logging', () => {
  describe('summarizeForLog', () => {
    it('redacts string content and keeps only length metadata', () => {
      const value = 'prompt: what is 2+2?';
      const summary = summarizeForLog(value);
      expect(summary).toBe(`type=string len=${value.length}`);
      expect(summary).not.toContain('prompt');
      expect(summary).not.toContain('2+2');
    });

    it('redacts error message contents', () => {
      const error = new Error('response: this should not be logged');
      const summary = summarizeForLog(error);
      expect(summary).toContain('type=Error');
      expect(summary).toContain('name=Error');
      expect(summary).not.toContain('response');
      expect(summary).not.toContain('should not be logged');
    });
  });

  describe('sanitizeOperationalMessage', () => {
    it('passes through short operational messages', () => {
      expect(sanitizeOperationalMessage('HTTP server stopped')).toBe('HTTP server stopped');
    });

    it('redacts potential AI payload text', () => {
      expect(sanitizeOperationalMessage('prompt: user asked for secret')).toBe(
        '[redacted-sensitive-message]'
      );
    });

    it('redacts structured payload-like strings', () => {
      expect(sanitizeOperationalMessage('{"content":"model output"}')).toBe(
        '[redacted-sensitive-message]'
      );
    });
  });
});
