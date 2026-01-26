import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEPRECATED_OPTIONS,
  checkDeprecations,
  formatDeprecationWarning,
  emitDeprecationWarnings,
} from '../../src/utils/deprecations.js';

describe('deprecations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DEPRECATED_OPTIONS', () => {
    it('includes maxHandoffIterations', () => {
      const option = DEPRECATED_OPTIONS.find((o) => o.key === 'maxHandoffIterations');

      expect(option).toBeDefined();
      expect(option?.removeVersion).toBe('v2.0.0');
      expect(option?.reason).toBeDefined();
      expect(option?.migration).toBeDefined();
    });

    it('includes debounceDelay', () => {
      const option = DEPRECATED_OPTIONS.find((o) => o.key === 'debounceDelay');

      expect(option).toBeDefined();
      expect(option?.removeVersion).toBe('v2.0.0');
      expect(option?.reason).toBeDefined();
      expect(option?.migration).toBeDefined();
    });

    it('all options have required fields', () => {
      for (const option of DEPRECATED_OPTIONS) {
        expect(option.key).toBeTruthy();
        expect(option.reason).toBeTruthy();
        expect(option.removeVersion).toBeTruthy();
        expect(option.migration).toBeTruthy();
      }
    });
  });

  describe('checkDeprecations', () => {
    it('returns empty array for clean config', () => {
      const config = {
        plansPath: './plans',
        dataPath: './data',
        coordinationPath: './coordination.json',
        heartbeatTimeout: 300000,
      };

      const result = checkDeprecations(config);

      expect(result).toEqual([]);
    });

    it('finds deprecated keys in config', () => {
      const config = {
        plansPath: './plans',
        maxHandoffIterations: 3,
        debounceDelay: 200,
      };

      const result = checkDeprecations(config);

      expect(result).toHaveLength(2);
      expect(result.map((o) => o.key)).toContain('maxHandoffIterations');
      expect(result.map((o) => o.key)).toContain('debounceDelay');
    });

    it('finds single deprecated key', () => {
      const config = {
        plansPath: './plans',
        maxHandoffIterations: 3,
      };

      const result = checkDeprecations(config);

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('maxHandoffIterations');
    });
  });

  describe('formatDeprecationWarning', () => {
    it('formats warning with all fields', () => {
      const option = {
        key: 'testOption',
        reason: 'Test reason',
        removeVersion: 'v3.0.0',
        migration: 'Remove this option.',
      };

      const result = formatDeprecationWarning(option);

      expect(result).toContain('testOption');
      expect(result).toContain('Test reason');
      expect(result).toContain('v3.0.0');
      expect(result).toContain('Remove this option.');
    });

    it('returns multi-line string', () => {
      const option = DEPRECATED_OPTIONS[0];
      const result = formatDeprecationWarning(option);

      const lines = result.split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('emitDeprecationWarnings', () => {
    it('writes to stderr for each option', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const options = [
        {
          key: 'test1',
          reason: 'Reason 1',
          removeVersion: 'v2.0.0',
          migration: 'Migration 1',
        },
        {
          key: 'test2',
          reason: 'Reason 2',
          removeVersion: 'v2.0.0',
          migration: 'Migration 2',
        },
      ];

      emitDeprecationWarnings(options);

      // Should have calls for each option plus empty line at end
      expect(errorSpy).toHaveBeenCalled();

      const allCalls = errorSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allCalls).toContain('test1');
      expect(allCalls).toContain('test2');
      expect(allCalls).toContain('⚠️');
    });

    it('does nothing for empty array', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      emitDeprecationWarnings([]);

      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
